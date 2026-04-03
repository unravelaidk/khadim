import type { AgentToolResult } from "@mariozechner/pi-agent-core";

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value, null, 2);
}

export function textToolResult<TDetails = unknown>(output: unknown, details?: TDetails): AgentToolResult<TDetails> {
  return {
    content: [{ type: "text", text: toText(output) }],
    details: details ?? (output as TDetails),
  };
}
