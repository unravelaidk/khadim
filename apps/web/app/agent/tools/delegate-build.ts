import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type, type Static } from "@mariozechner/pi-ai";
import { textToolResult } from "../tool-utils";

const delegateBuildParameters = Type.Object({
    plan: Type.String({ description: "The approved plan to execute, summarized clearly for the build agent" }),
    context: Type.Optional(Type.String({ description: "Additional context or user preferences to pass to build agent" })),
});

/**
 * Delegate to Build Tool
 * 
 * Called by the Plan agent when a plan is approved and ready for execution.
 * Returns a special marker that the API will detect to switch to Build mode.
 */
export function createDelegateToBuildTool() {
    return {
        name: "delegate_to_build",
        label: "delegate_to_build",
        description: `Hand off to the Build agent to execute an approved plan.
            
WHEN TO USE:
- After creating a plan with create_plan
- After getting user approval for the plan
- When you're ready for implementation to begin

IMPORTANT: This will transfer control to the Build agent. You (Plan agent) cannot execute the plan yourself.

Example flow:
1. User: "Create slides about AI"
2. You: Create plan with create_plan
3. You: Ask for approval with ask_user
4. User: "Yes, proceed"
5. You: Call delegate_to_build with the plan details`,
        parameters: delegateBuildParameters,
        execute: async (_toolCallId: string, { plan, context }: Static<typeof delegateBuildParameters>) => {
            return textToolResult(JSON.stringify({
                __DELEGATE_BUILD__: true,
                plan,
                context: context || "",
            }));
        },
    } satisfies AgentTool<typeof delegateBuildParameters>;
}

/**
 * Parse delegate_to_build response
 */
export function parseDelegateResponse(content: string): { plan: string; context: string } | null {
    try {
        const parsed = JSON.parse(content);
        if (parsed.__DELEGATE_BUILD__ === true && parsed.plan) {
            return {
                plan: parsed.plan,
                context: parsed.context || "",
            };
        }
    } catch {
        // Not a delegate response
    }
    return null;
}
