import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type, type Static } from "@mariozechner/pi-ai";
import { textToolResult } from "../tool-utils";

/**
 * Human-in-the-Loop Tool
 * Allows the agent to ask the user clarifying questions.
 * When invoked, this returns an interrupt payload the orchestrator can surface to the user.
 */
const askUserParameters = Type.Object({
    question: Type.String({ description: "The question to ask the user. Be clear and specific." }),
    options: Type.Optional(Type.Array(Type.String({ description: "A single choice the user can pick." }), {
        description: "Optional list of choices for the user to pick from. Use for multiple-choice questions.",
    })),
    context: Type.Optional(Type.String({ description: "Optional context explaining why you're asking this question." })),
});

export const createAskUserTool = (): AgentTool<typeof askUserParameters> => ({
    name: "ask_user",
    label: "ask_user",
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
    parameters: askUserParameters,
    execute: async (_toolCallId, { question, options, context }: Static<typeof askUserParameters>) => {
        const payload = {
            type: "ASK_USER" as const,
            question,
            options: options || [],
            context: context || "",
        };

        return textToolResult(`__INTERRUPT__:${JSON.stringify(payload)}`);
    },
});

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
