import type { AgentTool } from "@mariozechner/pi-agent-core";
import { StringEnum, Type, type Static } from "@mariozechner/pi-ai";
import { textToolResult } from "../tool-utils";

export type DelegateAgentPayload = {
    type: "DELEGATE_AGENT";
    agent: "build" | "plan" | "chat" | "general" | "explore" | "review";
    task: string;
    context: string;
};

const delegateAgentParameters = Type.Object({
    agent: StringEnum(["build", "plan", "chat", "general", "explore", "review"] as const, {
        description: "Which specialist should handle the task",
    }),
    task: Type.String({ description: "Clear, concise task for the specialist" }),
    context: Type.Optional(Type.String({ description: "Optional context or constraints for the task" })),
});

/**
 * Delegate to Agent Tool
 *
 * Used by the Manager to hand off a task to a specialist agent.
 */
export function createDelegateToAgentTool() {
    return {
        name: "delegate_to_agent",
        label: "delegate_to_agent",
        description: `Assign a specific task to a specialist agent.

WHEN TO USE:
- To route work to general, explore, review, or other primary agents when needed

IMPORTANT: Provide a clear, scoped task the specialist can complete.`,
        parameters: delegateAgentParameters,
        execute: async (_toolCallId: string, { agent, task, context }: Static<typeof delegateAgentParameters>) => {
            return textToolResult(JSON.stringify({
                __DELEGATE_AGENT__: true,
                agent,
                task,
                context: context || "",
            }));
        },
    } satisfies AgentTool<typeof delegateAgentParameters>;
}

export function parseDelegateAgentResponse(content: string): DelegateAgentPayload | null {
    try {
        const parsed = JSON.parse(content);
        if (parsed.__DELEGATE_AGENT__ === true && parsed.agent && parsed.task) {
            return {
                type: "DELEGATE_AGENT",
                agent: parsed.agent,
                task: parsed.task,
                context: parsed.context || "",
            };
        }
    } catch {
        
    }
    return null;
}
