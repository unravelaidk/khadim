
export type AgentMode = "plan" | "build" | "chat";

// Patterns that trigger BUILD mode (creating/making things)
const BUILD_PATTERNS = [
    // Create/build/make requests -> BUILD mode (not plan!)
    /create\s+(a|an|the)?\s*(new\s+)?(app|website|site|portfolio|game|project|slides|presentation|ppt)/i,
    /build\s+(a|an|the)?\s*(new\s+)?(app|website|site|portfolio|game|project|slides|presentation)/i,
    /make\s+(a|an|the)?\s*(new\s+)?(app|website|site|portfolio|game|project|slides|presentation|ppt)/i,
    /develop\s+(a|an|the)?/i,
    /implement\s+(a|an|the)?.*feature/i,
    /from\s+scratch/i,
    /full\s+(stack|website|app)/i,
    // Slides/Presentation patterns
    /slides?\s+(about|for|on)/i,
    /presentation\s+(about|for|on)/i,
    /powerpoint/i,
    /pptx?/i,
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
const BUILD_KEYWORDS = ["portfolio", "website", "game", "app", "application", "dashboard", "pong", "flappy", "snake", "tetris", "slides", "presentation", "powerpoint", "ppt"];

// Patterns that trigger PLAN mode (explicit planning requests only)
const PLAN_PATTERNS = [
    /plan\s+(how|what|the)/i,
    /analyze\s+(the|this|how)/i,
    /review\s+(the|this)/i,
    /explain\s+(how|the|this)/i,
    /what\s+would\s+it\s+take/i,
    /how\s+would\s+(you|i|we)\s+(build|create|make)/i,
];


// Patterns that trigger CHAT mode (greetings, general questions)
const CHAT_PATTERNS = [
    /^(hi|hello|hey|greetings)(\s|$)/i,
    /how\s+are\s+you/i,
    /who\s+are\s+you/i,
    /what\s+can\s+you\s+do/i,
    /help/i,
    /thanks/i,
    /thank\s+you/i,
    /cool/i,
    /awesome/i,
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

    // Check for CHAT patterns
    for (const pattern of CHAT_PATTERNS) {
        if (pattern.test(request)) {
            return "chat";
        }
    }

    // Default to PLAN for ambiguous inputs (likely requirements or answers to questions)
    return "plan";
}


export function shouldAutoContinue(planOutput: string): boolean {
    return planOutput.includes("Plan complete") ||
        planOutput.includes("EXECUTION PLAN") ||
        planOutput.includes("Ready to execute");
}
