import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { parseAskUserResponse, type AskUserPayload } from "./tools/ask-user";
import { parseDelegateResponse } from "./tools/delegate-build";
import { parseDelegateAgentResponse } from "./tools/delegate-agent";
import {
    getAgentConfig,
    filterToolsForAgent,
    isSubagent,
    type AgentId,
    PRIMARY_AGENT_IDS,
    SUBAGENT_IDS,
} from "./agents";

/**
 * Orchestrator State
 * Extends message state with multi-agent coordination fields
 */
export const OrchestratorState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (curr, update) => [...curr, ...update],
        default: () => [],
    }),
    currentAgent: Annotation<AgentId>({
        reducer: (_, update) => update,
        default: () => "build",
    }),
    requestedMode: Annotation<"plan" | "build" | "chat" | null>({
        reducer: (_, update) => update,
        default: () => null,
    }),
    activeTask: Annotation<string | null>({
        reducer: (_, update) => update,
        default: () => null,
    }),
    pendingQuestion: Annotation<AskUserPayload | null>({
        reducer: (_, update) => update,
        default: () => null,
    }),
    humanResponse: Annotation<string | null>({
        reducer: (_, update) => update,
        default: () => null,
    }),
    resumeAgent: Annotation<AgentId | null>({
        reducer: (_, update) => update,
        default: () => null,
    }),
    planApproved: Annotation<boolean>({
        reducer: (_, update) => update,
        default: () => false,
    }),
    toolLoopSignature: Annotation<string | null>({
        reducer: (_, update) => update,
        default: () => null,
    }),
    toolLoopCount: Annotation<number>({
        reducer: (_, update) => update,
        default: () => 0,
    }),
    loopDetected: Annotation<boolean>({
        reducer: (_, update) => update,
        default: () => false,
    }),
    returnAgent: Annotation<AgentId | null>({
        reducer: (_, update) => update,
        default: () => null,
    }),
    iterationCount: Annotation<number>({
        reducer: (_, update) => update,
        default: () => 0,
    }),
    hasResponded: Annotation<boolean>({
        reducer: (_, update) => update,
        default: () => false,
    }),
    toolHistory: Annotation<string[]>({
        reducer: (curr, update) => {
            const combined = [...curr, ...update];
            return combined.slice(-20);
        },
        default: () => [],
    }),
});

export type OrchestratorStateType = typeof OrchestratorState.State;

export interface OrchestratorConfig {
    model: ChatOpenAI;
    tools: any[];
    systemPrompt: string;
    onStepStart?: (step: { id: string; title: string }) => void;
    onStepComplete?: (step: { id: string; result?: string }) => void;
}

/**
 * Create the multi-agent orchestrator graph
 * Flow: router → primary agent → (subagents/tools) → primary agent → END
 */
export function createOrchestrator(config: OrchestratorConfig) {
    const { model, tools, systemPrompt } = config;

    // Create tool node
    const toolNode = new ToolNode(tools);

    const agentModels = new Map<AgentId, ChatOpenAI>();
    const allAgentIds = [...PRIMARY_AGENT_IDS, ...SUBAGENT_IDS];
    for (const agentId of allAgentIds) {
        const filtered = filterToolsForAgent(tools, agentId);
        agentModels.set(agentId, model.bindTools(filtered));
    }

    /**
     * Router Node: Determines which agent should handle the request
     * Handles resume from human-in-the-loop interruptions.
     */
    async function routerNode(state: OrchestratorStateType) {
        if (state.humanResponse && state.resumeAgent) {
            return {
                messages: [new HumanMessage(`User response: ${state.humanResponse}`)],
                humanResponse: null,
                pendingQuestion: null,
                currentAgent: state.resumeAgent as AgentId,
                resumeAgent: null,
                iterationCount: state.iterationCount + 1,
            };
        }

        if (state.requestedMode && state.currentAgent !== state.requestedMode) {
            return {
                currentAgent: state.requestedMode as AgentId,
                iterationCount: state.iterationCount + 1,
            };
        }

        return {
            iterationCount: state.iterationCount + 1,
        };
    }

    /**
     * Agent Node: Runs a primary or subagent with scoped tools.
     */
    async function agentNode(state: OrchestratorStateType, agentId: AgentId) {
        const agentConfig = getAgentConfig(agentId);
        const agentMessages = [
            new SystemMessage(`${systemPrompt}\n\n${agentConfig.systemPromptAddition}

Assigned task: ${state.activeTask || "No specific task assigned."}`),
            ...state.messages,
        ];

        const agentModel = agentModels.get(agentId) ?? model;
        const response = await agentModel.invoke(agentMessages);
        const hasToolCalls = "tool_calls" in response && Array.isArray(response.tool_calls) && response.tool_calls.length > 0;
        const hasContent = response.content && 
            (typeof response.content === 'string' ? response.content.trim().length > 0 : true);
        
        const updates: Partial<OrchestratorStateType> = {
            messages: [response],
            currentAgent: agentId,
            iterationCount: state.iterationCount + 1,
            // Mark as responded if agent gave text without requesting tools
            hasResponded: !hasToolCalls && !!hasContent,
        };

        if (state.returnAgent && isSubagent(agentId) && !hasToolCalls) {
            updates.currentAgent = state.returnAgent;
            updates.returnAgent = null;
        }

        return updates;
    }

    /**
     * Process tools and check for interrupts
     */
    async function processTools(state: OrchestratorStateType) {
        const messages = state.messages;
        const lastMessage = messages[messages.length - 1];

        if (!("tool_calls" in lastMessage) || !Array.isArray(lastMessage.tool_calls)) {
            return { messages: [] };
        }

        const toolCalls = lastMessage.tool_calls as Array<{ name?: string; args?: unknown }>;
        const signature = JSON.stringify(toolCalls.map((call) => ({ name: call.name, args: call.args })));
        const loopCount = state.toolLoopSignature === signature ? state.toolLoopCount + 1 : 1;
        
        // Exact signature match detection (existing)
        if (loopCount >= 3) {
            return {
                messages: [
                    new AIMessage(
                        "I keep repeating the same tool call and will stop to avoid a loop. Please adjust the request or provide more context.",
                    ),
                ],
                loopDetected: true,
            };
        }

        // Pattern-based loop detection: detect sequences like write_file→shell→write_file→shell
        const currentToolNames = toolCalls.map((call) => call.name || "unknown");
        const recentHistory = [...state.toolHistory, ...currentToolNames];
        if (recentHistory.length >= 8) {
            // Check for repeating 2-tool pattern in last 8 tools
            const last8 = recentHistory.slice(-8);
            const pattern = last8.slice(0, 2).join(",");
            const matches = [
                last8.slice(0, 2).join(","),
                last8.slice(2, 4).join(","),
                last8.slice(4, 6).join(","),
                last8.slice(6, 8).join(","),
            ];
            if (matches.every((m) => m === pattern)) {
                return {
                    messages: [
                        new AIMessage(
                            `I detected a repetitive tool pattern (${pattern.replace(",", " → ")}) and will stop to avoid an endless loop. The task may have encountered an issue that requires a different approach.`,
                        ),
                    ],
                    loopDetected: true,
                };
            }
        }

        // Execute tools
        const toolResponse = await toolNode.invoke(state);
        const toolMessages = toolResponse.messages || [];

        // Check for interrupts and delegation in tool responses
        for (const msg of toolMessages) {
            const content = typeof msg.content === "string" ? msg.content : "";
            const parsed = parseAskUserResponse(content);

            if (parsed) {
                return {
                    messages: toolMessages,
                    pendingQuestion: parsed,
                    resumeAgent: state.currentAgent,
                };
            }

            const agentDelegation = parseDelegateAgentResponse(content);
            if (agentDelegation) {
                const taskContext = agentDelegation.context
                    ? `${agentDelegation.task}\nContext: ${agentDelegation.context}`
                    : agentDelegation.task;
                // Add a HumanMessage so the delegated agent has context to act on
                const delegationMessage = new HumanMessage(
                    `[Primary agent delegated to you]\nTask: ${agentDelegation.task}${agentDelegation.context ? `\nContext: ${agentDelegation.context}` : ''}`
                );
                return {
                    messages: [...toolMessages, delegationMessage],
                    currentAgent: agentDelegation.agent,
                    activeTask: taskContext,
                    returnAgent: state.currentAgent,
                };
            }

            // Legacy plan -> build delegation
            const delegation = parseDelegateResponse(content);
            if (delegation) {
                const taskContext = delegation.context
                    ? `${delegation.plan}\nContext: ${delegation.context}`
                    : delegation.plan;
                // Add a HumanMessage so the build agent has context to act on
                const delegationMessage = new HumanMessage(
                    `[Plan agent delegated to you]\nApproved Plan: ${delegation.plan}${delegation.context ? `\nContext: ${delegation.context}` : ''}`
                );
                return {
                    messages: [...toolMessages, delegationMessage],
                    planApproved: true,
                    currentAgent: "build",
                    activeTask: taskContext,
                };
            }
        }

        return {
            messages: toolMessages,
            toolLoopSignature: signature,
            toolLoopCount: loopCount,
            hasResponded: false, // Reset so agent can respond after tool execution
            toolHistory: currentToolNames, // This will be merged by the reducer
        };
    }

    function routeAfterRouter(state: OrchestratorStateType): AgentId {
        return state.currentAgent;
    }

    function afterAgent(state: OrchestratorStateType): "tools" | "interrupt" | typeof END | AgentId {
        const messages = state.messages;
        const lastMessage = messages[messages.length - 1];

        if (state.pendingQuestion) {
            return "interrupt";
        }

        if (lastMessage && "tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
            return "tools";
        }

        // Agent gave a text response without tool calls - we're done
        if (state.hasResponded) {
            return END;
        }

        if (state.iterationCount > 30) {
            return END;
        }

        if (state.loopDetected) {
            return END;
        }

        if (isSubagent(state.currentAgent) && !state.returnAgent) {
            return END;
        }

        // Only loop back if we haven't responded yet (edge case)
        return END;
    }

    function afterChat(state: OrchestratorStateType): "tools" | "interrupt" | typeof END {
        const messages = state.messages;
        const lastMessage = messages[messages.length - 1];

        if (state.pendingQuestion) {
            return "interrupt";
        }

        if (lastMessage && "tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
            return "tools";
        }

        return END;
    }

    function afterTools(
        state: OrchestratorStateType
    ): AgentId | "interrupt" | typeof END {
        if (state.pendingQuestion) {
            return "interrupt";
        }

        if (state.loopDetected) {
            return END;
        }

        if (state.iterationCount > 30) {
            return END;
        }

        return state.currentAgent;
    }

    // Interrupt node - just marks state as interrupted
    async function interruptNode(state: OrchestratorStateType) {
        // This node doesn't modify state - it's a breakpoint
        // The graph will stop here and wait for external input
        return {};
    }

    // Build the graph
    const workflow = new StateGraph(OrchestratorState)
        .addNode("router", routerNode)
        .addNode("build", (state) => agentNode(state, "build"))
        .addNode("plan", (state) => agentNode(state, "plan"))
        .addNode("chat", (state) => agentNode(state, "chat"))
        .addNode("general", (state) => agentNode(state, "general"))
        .addNode("explore", (state) => agentNode(state, "explore"))
        .addNode("review", (state) => agentNode(state, "review"))
        .addNode("tools", processTools)
        .addNode("interrupt", interruptNode)
        .addEdge(START, "router")
        .addConditionalEdges("router", routeAfterRouter, ["build", "plan", "chat", "general", "explore", "review"])
        .addConditionalEdges("build", afterAgent, ["tools", "interrupt", END, "build", "plan", "chat", "general", "explore", "review"])
        .addConditionalEdges("plan", afterAgent, ["tools", "interrupt", END, "build", "plan", "chat", "general", "explore", "review"])
        .addConditionalEdges("general", afterAgent, ["tools", "interrupt", END, "build", "plan", "chat", "general", "explore", "review"])
        .addConditionalEdges("explore", afterAgent, ["tools", "interrupt", END, "build", "plan", "chat", "general", "explore", "review"])
        .addConditionalEdges("review", afterAgent, ["tools", "interrupt", END, "build", "plan", "chat", "general", "explore", "review"])
        .addConditionalEdges("chat", afterChat, ["tools", "interrupt", END])
        .addConditionalEdges("tools", afterTools, ["build", "plan", "chat", "general", "explore", "review", "interrupt", END])
        .addEdge("interrupt", END); // Interrupt exits the graph

    return workflow.compile({
        // Enable interrupt capability
        interruptBefore: ["interrupt"],
    });
}

/**
 * Resume orchestrator after human input
 */
export function createResumeState(
    previousState: OrchestratorStateType,
    humanResponse: string,
    approved: boolean = false
): Partial<OrchestratorStateType> {
    return {
        humanResponse,
        pendingQuestion: null,
        planApproved: approved || previousState.planApproved,
        toolLoopSignature: null,
        toolLoopCount: 0,
        loopDetected: false,
        currentAgent: (previousState.resumeAgent || previousState.currentAgent) as AgentId,
        resumeAgent: null,
    };
}
