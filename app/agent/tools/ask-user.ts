import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Human-in-the-Loop Tool
 * Allows the agent to ask the user clarifying questions.
 * When invoked, this triggers an interrupt in the LangGraph workflow.
 */
export const createAskUserTool = () => tool(
    async ({ question, options, context }: { 
        question: string; 
        options?: string[]; 
        context?: string;
    }) => {
        // Return a special marker that the orchestrator will detect
        // This triggers an interrupt in the graph execution
        const payload = {
            type: "ASK_USER",
            question,
            options: options || [],
            context: context || "",
        };
        
        return `__INTERRUPT__:${JSON.stringify(payload)}`;
    },
    {
        name: "ask_user",
        description: `Ask the user a clarifying question when you need more information to proceed.
        
USE THIS TOOL WHEN:
- The user's request is ambiguous or lacks details
- You need to confirm your understanding before building
- You want to offer the user choices (use the options parameter)
- You need approval for your plan before executing

EXAMPLES:
- "What color scheme would you prefer?" with options: ["Dark mode", "Light mode", "Colorful"]
- "Should I include a contact form on the portfolio?"
- "The request is unclear. Do you want a game or a website?"`,
        schema: z.object({
            question: z.string().describe("The question to ask the user. Be clear and specific."),
            options: z.array(z.string()).optional().describe("Optional list of choices for the user to pick from. Use for multiple-choice questions."),
            context: z.string().optional().describe("Optional context explaining why you're asking this question."),
        }),
    }
);

export type AskUserPayload = {
    type: "ASK_USER";
    question: string;
    options: string[];
    context: string;
};

export function parseAskUserResponse(response: string): AskUserPayload | null {
    if (!response.startsWith("__INTERRUPT__:")) {
        return null;
    }
    try {
        const jsonStr = response.slice("__INTERRUPT__:".length);
        return JSON.parse(jsonStr) as AskUserPayload;
    } catch {
        return null;
    }
}
