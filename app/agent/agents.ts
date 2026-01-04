// Agent configurations for Plan and Build modes

export interface AgentConfig {
    name: string;
    mode: "plan" | "build";
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
            // Shell is allowed but only for read-only commands (ls, cat, etc.)
            "shell",
        ],
        temperature: 0.1,
        systemPromptAddition: `
=== PLAN MODE (READ-ONLY) ===
You are in PLAN mode. Your job is to:
1. Analyze the user's request thoroughly
2. Research the requirements (read files, list directories)
3. Create a detailed execution plan using create_plan
4. Identify potential issues BEFORE any changes are made

RESTRICTIONS:
- You CANNOT write files
- You CANNOT create apps
- You CANNOT modify anything
- You CAN ONLY read, analyze, and plan

When your plan is complete, respond with:
"📋 Plan complete. Ready to execute with Build agent."

The Build agent will then execute your plan.
=== END PLAN MODE ===
`,
    },
    build: {
        name: "Build",
        mode: "build",
        description: "Execute plans and build features",
        allowedTools: ["*"], // All tools allowed
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
};

// Get agent config by mode
export function getAgentConfig(mode: "plan" | "build"): AgentConfig {
    return AGENTS[mode];
}

// Filter tools based on agent mode
export function filterToolsForAgent(
    tools: any[],
    mode: "plan" | "build"
): any[] {
    const config = AGENTS[mode];

    // Build mode gets all tools
    if (config.allowedTools.includes("*")) {
        return tools;
    }

    // Plan mode gets filtered tools
    return tools.filter((tool) => config.allowedTools.includes(tool.name));
}
