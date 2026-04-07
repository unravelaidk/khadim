import { query } from "@anthropic-ai/claude-agent-sdk";

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function extractTextFromAssistantMessage(message) {
  const content = message?.message?.content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((block) => {
      if (!block || typeof block !== "object") return [];
      if (block.type === "text" && typeof block.text === "string") return [block.text];
      if (block.type === "thinking" && typeof block.thinking === "string") return [block.thinking];
      return [];
    })
    .join("");
}

function usageMetadata(usage) {
  if (!usage || typeof usage !== "object") return null;
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
  const cacheRead = typeof usage.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : 0;
  const cacheWrite = typeof usage.cache_creation_input_tokens === "number" ? usage.cache_creation_input_tokens : 0;
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: cacheRead,
    cache_write_tokens: cacheWrite,
    provider: "anthropic",
  };
}

function toolTitle(toolName) {
  return `Running ${toolName}`;
}

function normalizeToolInput(input) {
  return input && typeof input === "object" ? input : {};
}

function stringifyToolInput(input) {
  const value = normalizeToolInput(input);
  return Object.keys(value).length > 0 ? JSON.stringify(value, null, 2) : "";
}

function summarizeToolResult(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          if (typeof item.text === "string") return item.text;
          if (typeof item.content === "string") return item.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.content === "string") return content.content;
    return JSON.stringify(content, null, 2);
  }
  return "";
}

function emitToolStart(toolStates, id, name, input) {
  if (toolStates.has(id)) return;
  const inputJson = stringifyToolInput(input);
  toolStates.set(id, { id, name, inputJson, completed: false });
  emit({
    event_type: "step_start",
    content: toolTitle(name),
    metadata: {
      id,
      title: toolTitle(name),
      tool: name,
    },
  });
  if (inputJson) {
    emit({
      event_type: "step_update",
      content: inputJson,
      metadata: {
        id,
        title: toolTitle(name),
        tool: name,
      },
    });
  }
}

function emitToolComplete(toolStates, id, result, isError = false) {
  const state = toolStates.get(id);
  if (!state || state.completed) return;
  state.completed = true;
  emit({
    event_type: "step_complete",
    content: result || (isError ? "Tool failed" : "Tool complete"),
    metadata: {
      id,
      title: `Completed ${state.name}`,
      tool: state.name,
      result: result || undefined,
      is_error: isError,
    },
  });
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("Missing Claude Code bridge input payload");
  return JSON.parse(raw);
}

try {
  const payload = await readInput();
  const { cwd, prompt, model, sessionId, resume } = payload ?? {};

  if (!cwd || typeof cwd !== "string") {
    throw new Error("Claude Code bridge requires a cwd");
  }
  if (!prompt || typeof prompt !== "string") {
    throw new Error("Claude Code bridge requires a prompt");
  }
  if (!sessionId || typeof sessionId !== "string") {
    throw new Error("Claude Code bridge requires a sessionId");
  }

  const toolStates = new Map();
  let thinkingText = "";
  const thinkingId = "claude-thinking";
  let emittedThinkingStart = false;
  let sawTextDelta = false;
  let fallbackAssistantText = "";

  const sdkQuery = query({
    prompt,
    options: {
      cwd,
      model: typeof model === "string" && model.trim() ? model.trim() : undefined,
      executable: "node",
      permissionMode: "acceptEdits",
      sessionId: resume ? undefined : sessionId,
      resume: resume ? sessionId : undefined,
      env: {
        ...process.env,
        CLAUDE_AGENT_SDK_CLIENT_APP: "khadim-desktop",
      },
    },
  });

  for await (const message of sdkQuery) {
    if (!message || typeof message !== "object") continue;

    if (message.type === "stream_event") {
      const event = message.event;
      if (!event || typeof event !== "object") continue;

      if (event.type === "content_block_start") {
        const block = event.content_block;
        const index = typeof event.index === "number" ? event.index : 0;
        if (["tool_use", "server_tool_use", "mcp_tool_use"].includes(block?.type)) {
          const id = typeof block.id === "string" ? block.id : `tool-${index}`;
          const name = typeof block.name === "string" ? block.name : "tool";
          toolStates.set(index, { id, name, inputJson: stringifyToolInput(block.input), completed: false });
          emitToolStart(toolStates, id, name, block.input);
        }
        if (block?.type === "thinking" && !emittedThinkingStart) {
          emittedThinkingStart = true;
          emit({
            event_type: "step_start",
            content: "Thinking",
            metadata: {
              id: thinkingId,
              title: "Thinking",
              tool: "model",
            },
          });
        }
      }

      if (event.type === "content_block_delta") {
        const index = typeof event.index === "number" ? event.index : 0;
        const delta = event.delta;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          sawTextDelta = true;
          emit({ event_type: "text_delta", content: delta.text, metadata: null });
        }
        if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
          thinkingText += delta.thinking;
          if (!emittedThinkingStart) {
            emittedThinkingStart = true;
            emit({
              event_type: "step_start",
              content: "Thinking",
              metadata: {
                id: thinkingId,
                title: "Thinking",
                tool: "model",
              },
            });
          }
          emit({
            event_type: "step_update",
            content: thinkingText,
            metadata: {
              id: thinkingId,
              title: "Thinking",
              tool: "model",
            },
          });
        }
        if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
          const state = toolStates.get(index);
          if (state) {
            state.inputJson += delta.partial_json;
            emit({
              event_type: "step_update",
              content: state.inputJson,
              metadata: {
                id: state.id,
                title: toolTitle(state.name),
                tool: state.name,
              },
            });
          }
        }
      }

      if (event.type === "content_block_stop") {
        const index = typeof event.index === "number" ? event.index : 0;
        const state = toolStates.get(index);
        if (state && state.inputJson) {
          emit({
            event_type: "step_update",
            content: state.inputJson,
            metadata: {
              id: state.id,
              title: toolTitle(state.name),
              tool: state.name,
            },
          });
        }
      }

      continue;
    }

    if (message.type === "tool_progress") {
      emitToolStart(toolStates, message.tool_use_id, message.tool_name, {});
      emit({
        event_type: "step_update",
        content: `Running ${message.tool_name}…`,
        metadata: {
          id: message.tool_use_id,
          title: toolTitle(message.tool_name),
          tool: message.tool_name,
        },
      });
      continue;
    }

    if (message.type === "tool_use_summary") {
      for (const toolUseId of message.preceding_tool_use_ids ?? []) {
        emitToolComplete(toolStates, toolUseId, message.summary, false);
      }
      continue;
    }

    if (message.type === "assistant") {
      const blocks = Array.isArray(message.message?.content) ? message.message.content : [];
      let handledToolUse = false;
      for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        if (["tool_use", "server_tool_use", "mcp_tool_use"].includes(block.type)) {
          handledToolUse = true;
          const id = typeof block.id === "string" ? block.id : crypto.randomUUID();
          const name = typeof block.name === "string" ? block.name : "tool";
          emitToolStart(toolStates, id, name, block.input);
        }
      }
      if (!handledToolUse) {
        fallbackAssistantText += extractTextFromAssistantMessage(message);
      }
      continue;
    }

    if (message.type === "user") {
      const blocks = Array.isArray(message.message?.content) ? message.message.content : [];
      for (const block of blocks) {
        if (!block || typeof block !== "object" || block.type !== "tool_result") continue;
        const toolUseId = typeof block.tool_use_id === "string" ? block.tool_use_id : null;
        if (!toolUseId) continue;
        const result = summarizeToolResult(block.content);
        emitToolComplete(toolStates, toolUseId, result, block.is_error === true);
      }
      continue;
    }

    if (message.type === "system" && message.subtype === "local_command_output" && typeof message.content === "string") {
      sawTextDelta = true;
      emit({ event_type: "text_delta", content: `\n${message.content}\n`, metadata: null });
      continue;
    }

    if (message.type === "result") {
      if (thinkingText) {
        emit({
          event_type: "step_complete",
          content: thinkingText,
          metadata: {
            id: thinkingId,
            title: "Thinking",
            tool: "model",
          },
        });
      }

      const usage = usageMetadata(message.usage);
      if (usage) {
        emit({
          event_type: "usage_update",
          content: null,
          metadata: usage,
        });
      }

      if (!sawTextDelta && typeof message.result === "string" && message.result) {
        emit({ event_type: "text_delta", content: message.result, metadata: null });
      } else if (!sawTextDelta && fallbackAssistantText) {
        emit({ event_type: "text_delta", content: fallbackAssistantText, metadata: null });
      }

      if (message.is_error) {
        const errorMessage = Array.isArray(message.errors) && message.errors.length > 0
          ? message.errors.join("\n")
          : typeof message.result === "string" && message.result
            ? message.result
            : "Claude Code run failed";
        emit({ event_type: "error", content: errorMessage, metadata: null });
      } else {
        emit({ event_type: "done", content: null, metadata: null });
      }
      process.exit(0);
    }
  }

  emit({ event_type: "done", content: null, metadata: null });
  process.exit(0);
} catch (error) {
  emit({
    event_type: "error",
    content: error instanceof Error ? error.message : String(error),
    metadata: null,
  });
  process.exit(1);
}
