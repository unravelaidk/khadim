
export type AgentMode = "plan" | "build";

const COMPLEX_PATTERNS = [
    /create\s+(a|an|the)?\s*(new\s+)?(app|website|site|portfolio|game|project)/i,
    /build\s+(a|an|the)?\s*(new\s+)?(app|website|site|portfolio|game|project)/i,
    /make\s+(a|an|the)?\s*(new\s+)?(app|website|site|portfolio|game|project)/i,
    /develop\s+(a|an|the)?/i,
    /implement\s+(a|an|the)?.*feature/i,
    /refactor/i,
    /redesign/i,
    /from\s+scratch/i,
    /full\s+(stack|website|app)/i,
];

const SIMPLE_PATTERNS = [
    /fix\s+(the|this|a)?\s*(error|bug|issue)/i,
    /change\s+(the|this)?\s*(color|text|font|size)/i,
    /update\s+(the|this)?\s*(text|content|title)/i,
    /add\s+(a|the)?\s*(button|link|image)/i,
    /remove\s+(the|this)?/i,
    /delete\s+(the|this)?/i,
    /rename/i,
    /move/i,
];


export function selectAgent(request: string): AgentMode {
    const lowerRequest = request.toLowerCase();

    for (const pattern of SIMPLE_PATTERNS) {
        if (pattern.test(request)) {
            return "build";
        }
    }

    for (const pattern of COMPLEX_PATTERNS) {
        if (pattern.test(request)) {
            return "plan";
        }
    }

    const complexKeywords = ["portfolio", "website", "game", "app", "application", "dashboard"];
    for (const keyword of complexKeywords) {
        if (lowerRequest.includes(keyword)) {
            return "plan";
        }
    }

    return "build";
}


export function shouldAutoContinue(planOutput: string): boolean {
    return planOutput.includes("Plan complete") ||
        planOutput.includes("EXECUTION PLAN") ||
        planOutput.includes("Ready to execute");
}
