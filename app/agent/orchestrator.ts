import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { parseAskUserResponse, type AskUserPayload } from "./tools/ask-user";
import { parseDelegateResponse } from "./tools/delegate-build";
import { parseDelegateAgentResponse } from "./tools/delegate-agent";

/**
 * Orchestrator State
 * Extends message state with multi-agent coordination fields
 */
export const OrchestratorState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (curr, update) => [...curr, ...update],
        default: () => [],
    }),
    currentAgent: Annotation<"manager" | "research" | "plan" | "build" | "review" | "chat">({
        reducer: (_, update) => update,
        default: () => "manager",
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
    resumeAgent: Annotation<"manager" | "research" | "plan" | "build" | "review" | "chat" | null>({
        reducer: (_, update) => update,
        default: () => null,
    }),
    planApproved: Annotation<boolean>({
        reducer: (_, update) => update,
        default: () => false,
    }),
    iterationCount: Annotation<number>({
        reducer: (_, update) => update,
        default: () => 0,
    }),
});

export type OrchestratorStateType = typeof OrchestratorState.State;

export interface OrchestratorConfig {
    model: ChatOpenAI;
    tools: any[];
    systemPrompt: string;
    managerSystemPrompt: string;
    researchSystemPrompt: string;
    planSystemPrompt: string;
    buildSystemPrompt: string;
    reviewSystemPrompt: string;
    onStepStart?: (step: { id: string; title: string }) => void;
    onStepComplete?: (step: { id: string; result?: string }) => void;
}

/**
 * Create the multi-agent orchestrator graph
 * Flow: router → manager → (specialists) → manager → END
 */
export function createOrchestrator(config: OrchestratorConfig) {
    const { model, tools, systemPrompt, managerSystemPrompt, researchSystemPrompt, planSystemPrompt, buildSystemPrompt, reviewSystemPrompt } = config;

    // Create tool node
    const toolNode = new ToolNode(tools);

    const filterToolsByName = (allowed: string[]) => tools.filter((tool) => allowed.includes(tool.name));

    const managerTools = filterToolsByName(["delegate_to_agent", "ask_user"]);
    const researchTools = filterToolsByName(["read_todo", "read_file", "list_files", "shell"]);
    const planTools = filterToolsByName(["create_plan", "read_todo", "read_file", "list_files", "ask_user", "shell"]);
    const reviewTools = filterToolsByName(["read_todo", "read_file", "list_files", "shell"]);

    const chatModel = model;

    // Bind tools to models per agent
    const managerModel = model.bindTools(managerTools);
    const researchModel = model.bindTools(researchTools);
    const planModel = model.bindTools(planTools);
    const buildModel = model.bindTools(tools);
    const reviewModel = model.bindTools(reviewTools);

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
                currentAgent: state.resumeAgent,
                resumeAgent: null,
                iterationCount: state.iterationCount + 1,
            };
        }

        return {
            iterationCount: state.iterationCount + 1,
        };
    }

    /**
     * Manager Node: Coordinates specialist agents
     */
    async function managerNode(state: OrchestratorStateType) {
        const managerMessages = [
            new SystemMessage(`${systemPrompt}\n\n${managerSystemPrompt}

Requested mode hint: ${state.requestedMode ?? "auto"}
${state.activeTask ? `Active task context: ${state.activeTask}` : ""}`),
            ...state.messages,
        ];

        const response = await managerModel.invoke(managerMessages);
        return { messages: [response], currentAgent: "manager", iterationCount: state.iterationCount + 1 };
    }

    /**
     * Research Agent Node: Read-only codebase investigation
     */
    async function researchAgentNode(state: OrchestratorStateType) {
        const researchMessages = [
            new SystemMessage(`${systemPrompt}\n\n${researchSystemPrompt}

Assigned task: ${state.activeTask || "No specific task assigned."}`),
            ...state.messages,
        ];

        const response = await researchModel.invoke(researchMessages);
        return { messages: [response], currentAgent: "research" };
    }

    /**
     * Plan Agent Node: Analyzes request and creates execution plan
     * Can ask clarifying questions via ask_user tool
     */
    async function planAgentNode(state: OrchestratorStateType) {
        const planMessages = [
            new SystemMessage(`${systemPrompt}\n\n${planSystemPrompt}

Assigned task: ${state.activeTask || "No specific task assigned."}`),
            ...state.messages,
        ];

        const response = await planModel.invoke(planMessages);
        return { messages: [response], currentAgent: "plan" };
    }

    /**
     * Build Agent Node: Executes the approved plan
     * Has access to all building tools
     */
    async function buildAgentNode(state: OrchestratorStateType) {
        const buildMessages = [
            new SystemMessage(`${systemPrompt}\n\n${buildSystemPrompt}

Assigned task: ${state.activeTask || "No specific task assigned."}`),
            ...state.messages,
        ];

        const response = await buildModel.invoke(buildMessages);
        return { messages: [response], currentAgent: "build" };
    }

    /**
     * Review Agent Node: Validate output and identify issues
     */
    async function reviewAgentNode(state: OrchestratorStateType) {
        const reviewMessages = [
            new SystemMessage(`${systemPrompt}\n\n${reviewSystemPrompt}

Assigned task: ${state.activeTask || "No specific task assigned."}`),
            ...state.messages,
        ];

        const response = await reviewModel.invoke(reviewMessages);
        return { messages: [response], currentAgent: "review" };
    }

    /**
     * Chat Agent Node: Simple conversational agent
     * For non-coding tasks
     */
    async function chatAgentNode(state: OrchestratorStateType) {
        const chatMessages = [
            new SystemMessage(systemPrompt),
            ...state.messages,
        ];

        const response = await chatModel.invoke(chatMessages);
        return { messages: [response], currentAgent: "chat" };
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
                return {
                    messages: toolMessages,
                    currentAgent: agentDelegation.agent,
                    activeTask: taskContext,
                };
            }

            // Legacy plan -> build delegation
            const delegation = parseDelegateResponse(content);
            if (delegation) {
                const taskContext = delegation.context
                    ? `${delegation.plan}\nContext: ${delegation.context}`
                    : delegation.plan;
                return {
                    messages: toolMessages,
                    planApproved: true,
                    currentAgent: "build",
                    activeTask: taskContext,
                };
            }
        }

        return { messages: toolMessages };
    }

    function routeAfterRouter(
        state: OrchestratorStateType
    ): "manager" | "research" | "plan" | "build" | "review" | "chat" {
        if (state.currentAgent === "research") return "research";
        if (state.currentAgent === "plan") return "plan";
        if (state.currentAgent === "build") return "build";
        if (state.currentAgent === "review") return "review";
        if (state.currentAgent === "chat") return "chat";
        return "manager";
    }

    function afterManager(state: OrchestratorStateType): "tools" | "interrupt" | typeof END {
        const messages = state.messages;
        const lastMessage = messages[messages.length - 1];

        if (state.pendingQuestion) {
            return "interrupt";
        }

        if (lastMessage && "tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
            return "tools";
        }

        if (state.iterationCount > 30) {
            return END;
        }

        return END;
    }

    function afterWorker(state: OrchestratorStateType): "tools" | "manager" | "interrupt" | typeof END {
        const messages = state.messages;
        const lastMessage = messages[messages.length - 1];

        if (state.pendingQuestion) {
            return "interrupt";
        }

        if (lastMessage && "tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
            return "tools";
        }

        if (state.iterationCount > 30) {
            return END;
        }

        return "manager";
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
    ): "manager" | "research" | "plan" | "build" | "review" | "chat" | "interrupt" | typeof END {
        if (state.pendingQuestion) {
            return "interrupt";
        }

        if (state.currentAgent === "manager") return "manager";
        if (state.currentAgent === "research") return "research";
        if (state.currentAgent === "plan") return "plan";
        if (state.currentAgent === "build") return "build";
        if (state.currentAgent === "review") return "review";
        if (state.currentAgent === "chat") return "chat";

        return END;
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
        .addNode("manager", managerNode)
        .addNode("research", researchAgentNode)
        .addNode("plan", planAgentNode)
        .addNode("build", buildAgentNode)
        .addNode("review", reviewAgentNode)
        .addNode("chat", chatAgentNode)
        .addNode("tools", processTools)
        .addNode("interrupt", interruptNode)
        .addEdge(START, "router")
        .addConditionalEdges("router", routeAfterRouter, ["manager", "research", "plan", "build", "review", "chat"])
        .addConditionalEdges("manager", afterManager, ["tools", "interrupt", END])
        .addConditionalEdges("research", afterWorker, ["tools", "manager", "interrupt", END])
        .addConditionalEdges("plan", afterWorker, ["tools", "manager", "interrupt", END])
        .addConditionalEdges("build", afterWorker, ["tools", "manager", "interrupt", END])
        .addConditionalEdges("review", afterWorker, ["tools", "manager", "interrupt", END])
        .addConditionalEdges("chat", afterChat, ["tools", "interrupt", END])
        .addConditionalEdges("tools", afterTools, ["manager", "research", "plan", "build", "review", "chat", "interrupt", END])
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
        currentAgent: previousState.resumeAgent || previousState.currentAgent,
        resumeAgent: null,
    };
}
