export type AgentId = "build" | "plan" | "chat" | "general" | "explore" | "review";
export type AgentKind = "primary" | "subagent";

export interface AgentConfig {
    id: AgentId;
    name: string;
    kind: AgentKind;
    description: string;
    allowedTools: string[] | "*";
    systemPromptAddition: string;
    temperature: number;
}

export const AGENTS: Record<AgentId, AgentConfig> = {
    build: {
        id: "build",
        name: "Build",
        kind: "primary",
        description: "Implement changes and execute tasks with full tool access.",
        allowedTools: "*",
        temperature: 0.6,
        systemPromptAddition: `
=== BUILD MODE (PRIMARY) ===
You are the primary BUILD agent with full access to all tools.
Execute approved plans efficiently and directly.

IMPORTANT: Always use "bun" instead of "npm" for package management commands.
For example: use "bun install", "bun run", "bun add" instead of "npm install", "npm run", "npm add".

If a plan exists, follow it step by step. If not, create one with create_plan first.
Use delegate_to_agent when you need focused exploration or review from subagents.

COMPLETION RULES:
- When you have finished your task, respond with a summary of what you accomplished.
- Do NOT call tools after completing your task.
- Do NOT loop back to yourself - respond once and stop.
- After giving a final response, STOP. No more tool calls.
=== END BUILD MODE ===
`,
    },
    plan: {
        id: "plan",
        name: "Plan",
        kind: "primary",
        description: "Analyze requests and produce plans without making code changes.",
        allowedTools: [
            "create_plan",
            "read_todo",
            "read_file",
            "list_files",
            "ask_user",
            "shell",
            "delegate_to_agent",
            "delegate_to_build",
        ],
        temperature: 0.4,
        systemPromptAddition: `
=== PLAN MODE (PRIMARY, READ-ONLY) ===
You are the primary PLANNING agent. Your job is to:
1. Analyze the user's request thoroughly.
2. If unclear, use ask_user to get clarification.
3. Create a detailed execution plan using create_plan.
4. Ask for approval with ask_user.
5. When approved, call delegate_to_build with the approved plan.

CRITICAL RULES:
- You CANNOT write files or build anything yourself.
- After user approval, you MUST call delegate_to_build (do not just respond with text).
- AFTER calling delegate_to_build, STOP. Do not respond with additional text.
- Once you call ask_user, STOP and wait for the user's response.
- Do NOT loop back to yourself after asking a question or delegating.
- After giving a final response, the conversation will end.
=== END PLAN MODE ===
`,
    },
    chat: {
        id: "chat",
        name: "Chat",
        kind: "primary",
        description: "General assistant for non-coding tasks.",
        allowedTools: [],
        temperature: 0.7,
        systemPromptAddition: `
=== CHAT MODE (PRIMARY) ===
You are in CHAT mode.
- You are a helpful AI assistant.
- You DO NOT have access to a coding sandbox or file system in this mode.
- If the user asks for code, explain they should request a build or plan to enable coding tools.
- Do NOT claim to have executed tools that are unavailable.
- Do NOT emit raw tool markup such as <tool_call> or pseudo-function calls.
=== END CHAT MODE ===
`,
    },
    general: {
        id: "general",
        name: "General",
        kind: "subagent",
        description: "General-purpose subagent for research, multi-step investigation, and gathering context.",
        allowedTools: ["read_todo", "read_file", "list_files", "shell"],
        temperature: 0.2,
        systemPromptAddition: `
=== GENERAL SUBAGENT (READ-ONLY) ===
You are a subagent focused on research and investigation.
Summarize findings clearly so the primary agent can proceed.
Do not modify files.
=== END GENERAL SUBAGENT ===
`,
    },
    explore: {
        id: "explore",
        name: "Explore",
        kind: "subagent",
        description: "Fast subagent for codebase exploration, search, and discovery.",
        allowedTools: ["read_file", "list_files", "shell"],
        temperature: 0.2,
        systemPromptAddition: `
=== EXPLORE SUBAGENT (READ-ONLY) ===
You are a subagent specialized in scanning and locating code quickly.
Report the exact files and findings needed by the primary agent.
Do not modify files.
=== END EXPLORE SUBAGENT ===
`,
    },
    review: {
        id: "review",
        name: "Review",
        kind: "subagent",
        description: "Read-only reviewer for correctness, risks, and gaps.",
        allowedTools: ["read_todo", "read_file", "list_files", "shell"],
        temperature: 0.1,
        systemPromptAddition: `
=== REVIEW SUBAGENT (READ-ONLY) ===
You are a subagent that reviews plans or changes for correctness and risks.
Provide concise issues and recommendations.
Do not modify files.
=== END REVIEW SUBAGENT ===
`,
    },
};

export const PRIMARY_AGENT_IDS: AgentId[] = ["build", "plan", "chat"];
export const SUBAGENT_IDS: AgentId[] = ["general", "explore", "review"];

export function getAgentConfig(id: AgentId): AgentConfig {
    return AGENTS[id];
}

export function isSubagent(id: AgentId): boolean {
    return AGENTS[id].kind === "subagent";
}

export function filterToolsForAgent(tools: any[], id: AgentId): any[] {
    const config = AGENTS[id];
    if (config.allowedTools === "*") {
        return tools;
    }
    return tools.filter((tool) => config.allowedTools.includes(tool.name));
}
