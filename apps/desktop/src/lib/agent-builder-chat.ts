/* ═══════════════════════════════════════════════════════════════════════
   Agent Builder Chat — system prompt + extraction for the
   "describe an agent in chat" flow.
   ═══════════════════════════════════════════════════════════════════════ */

import type { UpsertManagedAgentInput } from "./bindings";

/** The system prompt injected into a standalone chat to guide agent creation. */
export const AGENT_BUILDER_SYSTEM_PROMPT = `You are Khadim's Agent Builder. Your job is to help the user design a new managed agent through a friendly, focused conversation.

## How to proceed

1. **Ask what they want automated.** Start by asking what task or workflow they want to automate. Listen carefully — ask one or two clarifying follow-ups if the task is vague.

2. **Propose a name and description.** Once you understand the task, suggest a short name (2-4 words) and a one-sentence description.

3. **Draft the instructions.** Write clear, step-by-step instructions the agent will follow. Use numbered steps. Include any conditions, fallbacks, or edge cases the user mentioned. If the instructions need dynamic values, use {{variable_name}} placeholders and note what each variable means.

4. **Recommend tools.** Based on the task, recommend which tool domains the agent needs. Available domains:
   - browser — Web automation, scraping, form filling
   - email — Send and read email via IMAP/SMTP
   - spreadsheet — Read and write Excel, CSV files
   - http — Make REST API requests
   - files — Read, write, and manage local files
   - shell — Run commands and scripts
   - screen — Screenshots, OCR, mouse/keyboard
   - coding — LSP, git, syntax analysis

5. **Ask about trigger and approval.** Ask if the agent should run manually, on a schedule (cron), or on an event. Ask whether it should ask before sensitive actions, auto-approve known actions, or run fully autonomous.

6. **Present the final config.** Once everything is confirmed, output the complete agent definition inside a fenced JSON block tagged \`\`\`agent-config. This block must contain exactly this shape:

\`\`\`agent-config
{
  "name": "...",
  "description": "...",
  "instructions": "...",
  "tools": ["shell", "files"],
  "trigger_type": "manual",
  "trigger_config": "",
  "approval_mode": "ask",
  "max_turns": 25,
  "max_tokens": 100000,
  "variables": {}
}
\`\`\`

## Rules

- Keep the conversation short — 3-5 exchanges is ideal.
- Don't ask about runner type, harness, model, or environment — those are set separately.
- Always end with the \`\`\`agent-config block so the UI can parse it.
- If the user changes their mind about something, regenerate the full config block.
- Be concise and practical. No filler.`;

/** Matches the last ```agent-config ... ``` block in a string. */
const CONFIG_BLOCK_RE = /```agent-config\s*\n([\s\S]*?)```/g;

export interface ParsedAgentConfig {
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  trigger_type: "manual" | "schedule" | "event";
  trigger_config: string;
  approval_mode: "auto" | "ask" | "never";
  max_turns: number;
  max_tokens: number;
  variables: Record<string, string>;
}

/**
 * Extract the last `agent-config` JSON block from message text.
 * Returns null if no valid block is found.
 */
export function extractAgentConfig(text: string): ParsedAgentConfig | null {
  let lastMatch: string | null = null;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = CONFIG_BLOCK_RE.exec(text)) !== null) {
    lastMatch = m[1];
  }
  if (!lastMatch) return null;

  try {
    const raw = JSON.parse(lastMatch.trim());
    if (!raw || typeof raw !== "object") return null;
    if (!raw.name || !raw.instructions) return null;

    const VALID_TOOLS = new Set([
      "browser", "email", "spreadsheet", "http", "files", "shell", "screen", "coding",
    ]);
    const VALID_TRIGGERS = new Set(["manual", "schedule", "event"]);
    const VALID_APPROVAL = new Set(["auto", "ask", "never"]);

    return {
      name: String(raw.name).trim(),
      description: String(raw.description ?? "").trim(),
      instructions: String(raw.instructions).trim(),
      tools: Array.isArray(raw.tools)
        ? raw.tools.filter((t: unknown) => typeof t === "string" && VALID_TOOLS.has(t))
        : ["shell", "files"],
      trigger_type: VALID_TRIGGERS.has(raw.trigger_type) ? raw.trigger_type : "manual",
      trigger_config: String(raw.trigger_config ?? ""),
      approval_mode: VALID_APPROVAL.has(raw.approval_mode) ? raw.approval_mode : "ask",
      max_turns: typeof raw.max_turns === "number" && raw.max_turns > 0 ? raw.max_turns : 25,
      max_tokens: typeof raw.max_tokens === "number" && raw.max_tokens > 0 ? raw.max_tokens : 100000,
      variables: raw.variables && typeof raw.variables === "object" ? raw.variables : {},
    };
  } catch {
    return null;
  }
}

/**
 * Convert a parsed agent config into the shape expected by `createManagedAgent`.
 */
export function configToUpsertInput(config: ParsedAgentConfig): UpsertManagedAgentInput {
  return {
    name: config.name,
    description: config.description,
    instructions: config.instructions,
    tools: config.tools,
    trigger_type: config.trigger_type,
    trigger_config: config.trigger_config || null,
    approval_mode: config.approval_mode,
    runner_type: "local",
    harness: "khadim",
    model_id: null,
    environment_id: null,
    max_turns: config.max_turns,
    max_tokens: config.max_tokens,
    variables: Object.keys(config.variables).length > 0 ? config.variables : null,
  };
}

/**
 * Scan all messages in a conversation for the last valid agent-config block.
 * Only looks in assistant messages.
 */
export function findAgentConfigInMessages(
  messages: Array<{ role: string; content: string }>,
): ParsedAgentConfig | null {
  // Scan from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const config = extractAgentConfig(msg.content);
    if (config) return config;
  }
  return null;
}
