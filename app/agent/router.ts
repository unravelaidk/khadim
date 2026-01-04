
export type AgentMode = "plan" | "build" | "chat";

// Patterns that trigger BUILD mode (creating/making things)
const BUILD_PATTERNS = [
    // Create/build/make requests -> BUILD mode (not plan!)
    /create\s+(a|an|the)?\s*(new\s+)?(app|website|site|portfolio|game|project)/i,
    /build\s+(a|an|the)?\s*(new\s+)?(app|website|site|portfolio|game|project)/i,
    /make\s+(a|an|the)?\s*(new\s+)?(app|website|site|portfolio|game|project)/i,
    /develop\s+(a|an|the)?/i,
    /implement\s+(a|an|the)?.*feature/i,
    /from\s+scratch/i,
    /full\s+(stack|website|app)/i,
    // Modification patterns
    /fix\s+(the|this|a)?\s*(error|bug|issue)/i,
    /change\s+(the|this)?\s*(color|text|font|size)/i,
    /update\s+(the|this)?\s*(text|content|title)/i,
    /add\s+(a|the)?\s*(button|link|image)/i,
    /remove\s+(the|this)?/i,
    /delete\s+(the|this)?/i,
    /rename/i,
    /move/i,
    /write/i,
    /generate/i,
    /code/i,
    /script/i,
    /function/i,
    /react/i,
    /css/i,
    /html/i,
    /javascript/i,
    /typescript/i,
    /database/i,
    /api/i,
    /start\s+server/i,
    /run/i,
    /install/i,
];

// Keywords that trigger BUILD mode
const BUILD_KEYWORDS = ["portfolio", "website", "game", "app", "application", "dashboard", "pong", "flappy", "snake", "tetris"];

// Patterns that trigger PLAN mode (explicit planning requests only)
const PLAN_PATTERNS = [
    /plan\s+(how|what|the)/i,
    /analyze\s+(the|this|how)/i,
    /review\s+(the|this)/i,
    /explain\s+(how|the|this)/i,
    /what\s+would\s+it\s+take/i,
    /how\s+would\s+(you|i|we)\s+(build|create|make)/i,
];


export function selectAgent(request: string): AgentMode {
    const lowerRequest = request.toLowerCase();

    // Check for explicit PLAN patterns first
    for (const pattern of PLAN_PATTERNS) {
        if (pattern.test(request)) {
            return "plan";
        }
    }

    // Check for BUILD patterns
    for (const pattern of BUILD_PATTERNS) {
        if (pattern.test(request)) {
            return "build";
        }
    }

    // Check for BUILD keywords (games, apps, etc.)
    for (const keyword of BUILD_KEYWORDS) {
        if (lowerRequest.includes(keyword)) {
            return "build";
        }
    }

    return "chat";
}


export function shouldAutoContinue(planOutput: string): boolean {
    return planOutput.includes("Plan complete") ||
        planOutput.includes("EXECUTION PLAN") ||
        planOutput.includes("Ready to execute");
}
