import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { parseAskUserResponse, type AskUserPayload } from "./tools/ask-user";

/**
 * Orchestrator State
 * Extends message state with multi-agent coordination fields
 */
export const OrchestratorState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (curr, update) => [...curr, ...update],
        default: () => [],
    }),
    currentAgent: Annotation<"router" | "plan" | "build" | "chat">({
        reducer: (_, update) => update,
        default: () => "router",
    }),
    pendingQuestion: Annotation<AskUserPayload | null>({
        reducer: (_, update) => update,
        default: () => null,
    }),
    humanResponse: Annotation<string | null>({
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
    planSystemPrompt: string;
    buildSystemPrompt: string;
    onStepStart?: (step: { id: string; title: string }) => void;
    onStepComplete?: (step: { id: string; result?: string }) => void;
}

/**
 * Create the multi-agent orchestrator graph
 * Flow: router → plan → (ask human if needed) → build → END
 */
export function createOrchestrator(config: OrchestratorConfig) {
    const { model, tools, systemPrompt, planSystemPrompt, buildSystemPrompt } = config;

    // Create tool node
    const toolNode = new ToolNode(tools);

    // Bind tools to model
    const modelWithTools = model.bindTools(tools);

    /**
     * Router Node: Determines which agent should handle the request
     * Based on current state and message content
     */
    async function routerNode(state: OrchestratorStateType) {
        const messages = state.messages;
        const lastMessage = messages[messages.length - 1];

        // If we have a pending human response, inject it and continue
        if (state.humanResponse && state.pendingQuestion) {
            return {
                messages: [new HumanMessage(`User response: ${state.humanResponse}`)],
                pendingQuestion: null,
                humanResponse: null,
                currentAgent: state.planApproved ? "build" : "plan",
            };
        }

        // Default to plan agent on first iteration
        return {
            currentAgent: "plan" as const,
            iterationCount: state.iterationCount + 1,
        };
    }

    /**
     * Plan Agent Node: Analyzes request and creates execution plan
     * Can ask clarifying questions via ask_user tool
     */
    async function planAgentNode(state: OrchestratorStateType) {
        const planMessages = [
            new SystemMessage(`${systemPrompt}\n\n${planSystemPrompt}
            
IMPORTANT: You are in PLANNING mode.
- Analyze the user's request carefully
- If the request is unclear or needs more details, use the ask_user tool
- Create a detailed plan using create_plan tool
- After creating the plan, ask the user for approval using ask_user

Example flow:
1. User: "Build me a website"
2. You: ask_user("What type of website? I can help with portfolios, landing pages, or e-commerce sites.")
3. User responds: "A portfolio"
4. You: create_plan with steps for portfolio
5. You: ask_user("Does this plan look good? Should I proceed?")
6. User: "Yes, go ahead"
7. Plan is approved, build agent takes over`),
            ...state.messages,
        ];

        const response = await modelWithTools.invoke(planMessages);

        // Check if the response contains a tool call for ask_user
        if ("tool_calls" in response && Array.isArray(response.tool_calls)) {
            // Return the response - tool node will process it
            return { messages: [response], currentAgent: "plan" };
        }

        return { messages: [response], currentAgent: "plan" };
    }

    /**
     * Build Agent Node: Executes the approved plan
     * Has access to all building tools
     */
    async function buildAgentNode(state: OrchestratorStateType) {
        const buildMessages = [
            new SystemMessage(`${systemPrompt}\n\n${buildSystemPrompt}
            
You are in BUILD mode. Execute the approved plan efficiently.
The planning phase is complete - now implement what was planned.`),
            ...state.messages,
        ];

        const response = await modelWithTools.invoke(buildMessages);
        return { messages: [response], currentAgent: "build" };
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

        // Check for interrupt in tool responses
        for (const msg of toolMessages) {
            const content = typeof msg.content === "string" ? msg.content : "";
            const parsed = parseAskUserResponse(content);
            
            if (parsed) {
                return {
                    messages: toolMessages,
                    pendingQuestion: parsed,
                };
            }
        }

        return { messages: toolMessages };
    }

    /**
     * Routing logic: determine next node based on state
     */
    function shouldContinue(state: OrchestratorStateType): "tools" | "plan" | "build" | "interrupt" | typeof END {
        const messages = state.messages;
        const lastMessage = messages[messages.length - 1];

        // If there's a pending question, interrupt
        if (state.pendingQuestion) {
            return "interrupt";
        }

        // If the last message has tool calls, process them
        if (lastMessage && "tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
            return "tools";
        }

        // If plan is approved, go to build
        if (state.planApproved && state.currentAgent === "plan") {
            return "build";
        }

        // Check iteration limit
        if (state.iterationCount > 20) {
            return END;
        }

        // If we just finished tools, continue with current agent
        if (state.currentAgent === "plan") {
            return "plan";
        }

        if (state.currentAgent === "build") {
            return "build";
        }

        return END;
    }

    function afterTools(state: OrchestratorStateType): "plan" | "build" | "interrupt" | typeof END {
        // Check for interrupt
        if (state.pendingQuestion) {
            return "interrupt";
        }

        // Continue with current agent
        if (state.currentAgent === "plan") {
            return "plan";
        }
        if (state.currentAgent === "build") {
            return "build";
        }

        return END;
    }

    function afterPlan(state: OrchestratorStateType): "tools" | "build" | "interrupt" | typeof END {
        const messages = state.messages;
        const lastMessage = messages[messages.length - 1];

        // If there's a pending question, interrupt
        if (state.pendingQuestion) {
            return "interrupt";
        }

        // If the last message has tool calls, process them
        if (lastMessage && "tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
            return "tools";
        }

        // If plan is approved, go to build
        if (state.planApproved) {
            return "build";
        }

        return END;
    }

    function afterBuild(state: OrchestratorStateType): "tools" | typeof END {
        const messages = state.messages;
        const lastMessage = messages[messages.length - 1];

        // If the last message has tool calls, process them
        if (lastMessage && "tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
            return "tools";
        }

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
        .addNode("plan", planAgentNode)
        .addNode("build", buildAgentNode)
        .addNode("tools", processTools)
        .addNode("interrupt", interruptNode)
        .addEdge(START, "router")
        .addEdge("router", "plan")
        .addConditionalEdges("plan", afterPlan, ["tools", "build", "interrupt", END])
        .addConditionalEdges("build", afterBuild, ["tools", END])
        .addConditionalEdges("tools", afterTools, ["plan", "build", "interrupt", END])
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
    };
}
