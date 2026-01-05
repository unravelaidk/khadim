// Agent configurations for Plan and Build modes

export interface AgentConfig {
    name: string;
    mode: "plan" | "build" | "chat";
    description: string;
    allowedTools: string[];
    systemPromptAddition: string;
    temperature: number;
}

export const AGENTS: Record<string, AgentConfig> = {
    plan: {
        name: "Plan",
        mode: "plan",
        description: "Analyze and plan without making changes",
        allowedTools: [
            "create_plan",
            "read_todo",
            "read_file",
            "list_files",
            "ask_user",
            "delegate_to_build",  // Hand off to build agent when ready
            // Shell is allowed but only for read-only commands (ls, cat, etc.)
            "shell",
        ],
        temperature: 0.1,
        systemPromptAddition: `
=== PLAN MODE (READ-ONLY) ===
You are the PLANNING agent. Your job is to:
1. Analyze the user's request thoroughly
2. If unclear, use ask_user to get clarification
3. Create a detailed execution plan using create_plan
4. Ask user for approval with ask_user
5. Once approved, call delegate_to_build to hand off to Build agent

CRITICAL:
- You CANNOT write files or build anything yourself
- ALWAYS use delegate_to_build when user approves the plan
- NEVER try to implement - that's the Build agent's job

WORKFLOW:
1. Unclear request? → ask_user for clarification
2. Clear request → create_plan with steps
3. Plan created → ask_user("Does this plan look good?")
4. User approves → delegate_to_build({ plan: "summary", context: "details" })
=== END PLAN MODE ===
`,
    },
    build: {
        name: "Build",
        mode: "build",
        description: "Execute plans and build features",
        allowedTools: ["*"], 
        temperature: 0.3,
        systemPromptAddition: `
=== BUILD MODE (FULL ACCESS) ===
You are in BUILD mode with full access to all tools.
Execute the plan efficiently and directly.

If a plan was created by the Plan agent, follow it step by step.
If no plan exists, create one first using create_plan.
=== END BUILD MODE ===
`,
    },
    chat: {
        name: "Chat",
        mode: "chat",
        description: "General assistant for non-coding tasks",
        allowedTools: [], // No tools allowed
        temperature: 0.7,
        systemPromptAddition: `
=== CHAT MODE ===
You are in CHAT mode.
- You are a helpful AI assistant.
- You DO NOT have access to a coding sandbox or file system in this mode.
- If the user asks for code, explain that you are in chat mode and they should ask to "write code" or "create an app" to trigger the coding tools.
- Answer questions directly and concisely.
=== END CHAT MODE ===
`,
    },
};

// Get agent config by mode
export function getAgentConfig(mode: "plan" | "build" | "chat"): AgentConfig {
    return AGENTS[mode];
}

// Filter tools based on agent mode
export function filterToolsForAgent(
    tools: any[],
    mode: "plan" | "build" | "chat"
): any[] {
    const config = AGENTS[mode];

    // Build mode gets all tools
    if (config.allowedTools.includes("*")) {
        return tools;
    }

    // Plan mode gets filtered tools
    return tools.filter((tool) => config.allowedTools.includes(tool.name));
}
