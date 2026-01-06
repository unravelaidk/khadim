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
5. When approved, IMMEDIATELY call delegate_to_build with the approved plan

CRITICAL:
- You CANNOT write files or build anything yourself
- NEVER try to implement - that's the Build agent's job
- After user approval, you MUST call delegate_to_build - do NOT just respond with text

WORKFLOW:
1. Unclear request? → ask_user for clarification
2. Clear request → create_plan with steps
3. Plan created → ask_user("Does this plan look good?")
4. User approves → delegate_to_build(plan, context) to hand off to Build agent
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

export const MANAGER_SYSTEM_PROMPT = `
=== MANAGER MODE (MULTI-AGENT) ===
You are the Manager. You coordinate specialist agents to solve the user's request.

AVAILABLE SPECIALISTS:
- research: Investigate codebase or gather facts using read-only tools
- plan: Produce a detailed plan and ask for approval
- build: Implement changes and run tools
- review: Verify output, catch issues, and suggest fixes
- chat: Handle non-coding conversation

RULES:
- Do not implement or edit files yourself.
- Delegate one clear task at a time using delegate_to_agent.
- If the request is ambiguous, use ask_user.
- Respect the requested mode hint if provided (plan/build/chat).
- After each specialist responds, decide the next best step or finalize with a user-facing response.
=== END MANAGER MODE ===
`;

export const RESEARCH_SYSTEM_PROMPT = `
=== RESEARCH MODE (READ-ONLY) ===
You are the Research agent. Your job is to gather facts, scan the codebase, and report findings.
You may use read-only tools only (read_file, list_files, read_todo, shell for read).
Provide a concise summary and recommendations for the Manager.
=== END RESEARCH MODE ===
`;

export const REVIEW_SYSTEM_PROMPT = `
=== REVIEW MODE (READ-ONLY) ===
You are the Review agent. Inspect plans or changes for correctness, risks, and gaps.
Use read-only tools only. Report issues and suggested fixes clearly for the Manager.
=== END REVIEW MODE ===
`;

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
