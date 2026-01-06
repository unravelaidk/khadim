import { tool } from "@langchain/core/tools";
import { z } from "zod";

export type DelegateAgentPayload = {
    type: "DELEGATE_AGENT";
    agent: "manager" | "research" | "plan" | "build" | "review" | "chat";
    task: string;
    context: string;
};

/**
 * Delegate to Agent Tool
 *
 * Used by the Manager to hand off a task to a specialist agent.
 */
export function createDelegateToAgentTool() {
    return tool(
        async ({ agent, task, context }: { agent: DelegateAgentPayload["agent"]; task: string; context?: string }) => {
            return JSON.stringify({
                __DELEGATE_AGENT__: true,
                agent,
                task,
                context: context || "",
            });
        },
        {
            name: "delegate_to_agent",
            description: `Assign a specific task to a specialist agent.

WHEN TO USE:
- To route work to research, plan, build, review, or chat specialists

IMPORTANT: Provide a clear, scoped task the specialist can complete.`,
            schema: z.object({
                agent: z.enum(["manager", "research", "plan", "build", "review", "chat"]).describe("Which specialist should handle the task"),
                task: z.string().describe("Clear, concise task for the specialist"),
                context: z.string().optional().describe("Optional context or constraints for the task"),
            }),
        }
    );
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
