import { useMemo, useState, memo } from "react";
import KhadimLogo from "../assets/Khadim-logo.svg";
import OpenCodeLogo from "../assets/model-icons/opencode-color.svg";
import type { ChatMessage as Message, ThinkingStepData } from "../lib/bindings";
import { formatMessageTime } from "../lib/ui";
import { ThinkingSteps } from "./ThinkingSteps";
import { MarkdownRenderer } from "./MarkdownRenderer";

type BackendType = "khadim" | "opencode" | "claude_code" | string;

function getBackendLabel(backend: BackendType): string {
  if (backend === "opencode") return "OpenCode";
  if (backend === "claude_code") return "Claude Code";
  if (backend === "khadim") return "Khadim";
  return backend.charAt(0).toUpperCase() + backend.slice(1);
}

/** Reconstruct tool-call steps from the raw OpenCode message JSON stored in metadata. */
function truncateText(text: string, maxLength = 280) {
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

function stringifyValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function pathBasename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function toolFilePath(input: Record<string, unknown> | undefined) {
  const raw = input?.filePath ?? input?.path;
  return typeof raw === "string" ? raw : undefined;
}

function toolTitle(tool: string, input: Record<string, unknown> | undefined, filename: string | undefined) {
  if (tool === "task") {
    const subagentType = typeof input?.subagent_type === "string" ? input.subagent_type : "subagent";
    const description = typeof input?.description === "string" ? input.description.trim() : "";
    return description ? `Launching ${subagentType}: ${description}` : `Launching ${subagentType}`;
  }

  if (tool === "subtask") {
    const subagentType = typeof input?.agent === "string" ? input.agent : "subagent";
    const description = typeof input?.description === "string" ? input.description.trim() : "";
    return description ? `${subagentType}: ${description}` : `Subagent: ${subagentType}`;
  }

  if (tool === "question") {
    return "Question";
  }

  if (filename) {
    if (tool === "read") return `Reading ${filename}`;
    if (tool === "write") return `Writing ${filename}`;
    return `${tool.replace(/_/g, " ")} ${filename}`;
  }

  if (tool === "bash") return "Running command";
  return tool.replace(/_/g, " ");
}

function taskDescription(input: Record<string, unknown> | undefined) {
  return typeof input?.description === "string" && input.description.trim()
    ? input.description.trim()
    : undefined;
}

function taskPrompt(input: Record<string, unknown> | undefined) {
  return typeof input?.prompt === "string" && input.prompt.trim()
    ? input.prompt.trim()
    : undefined;
}

function taskSubagentType(input: Record<string, unknown> | undefined) {
  const raw = typeof input?.subagent_type === "string"
    ? input.subagent_type
    : typeof input?.agent === "string"
      ? input.agent
      : undefined;
  return raw && raw.trim()
    ? raw.trim()
    : undefined;
}

function toolContent(tool: string, input: Record<string, unknown> | undefined) {
  if (!input) return undefined;
  if (tool === "task") {
    const description = typeof input.description === "string" ? input.description.trim() : "";
    const prompt = typeof input.prompt === "string" ? truncateText(input.prompt, 420) : "";
    const subagentType = typeof input.subagent_type === "string" ? input.subagent_type : "";
    return [description, subagentType ? `subagent: ${subagentType}` : "", prompt]
      .filter(Boolean)
      .join("\n\n") || undefined;
  }

  if (tool === "subtask") {
    const description = typeof input.description === "string" ? input.description.trim() : "";
    const prompt = typeof input.prompt === "string" ? truncateText(input.prompt, 420) : "";
    const subagentType = typeof input.agent === "string" ? input.agent : "";
    return [description, subagentType ? `subagent: ${subagentType}` : "", prompt]
      .filter(Boolean)
      .join("\n\n") || undefined;
  }

  if (typeof input.command === "string") return input.command;
  if (typeof input.filePath === "string") return input.filePath;
  if (typeof input.path === "string") return input.path;
  return stringifyValue(input);
}

function toolResult(state: Record<string, unknown>) {
  const metadata = state.metadata as Record<string, unknown> | undefined;
  if (typeof metadata?.preview === "string" && metadata.preview.trim()) {
    return metadata.preview;
  }

  const output = state.output;
  if (output && typeof output === "object") {
    const outputObject = output as Record<string, unknown>;
    for (const key of ["result", "message", "text", "summary"]) {
      if (typeof outputObject[key] === "string" && outputObject[key].trim()) {
        return truncateText(outputObject[key] as string, 420);
      }
    }
    if (typeof outputObject.task_id === "string" && outputObject.task_id) {
      return `Task started: ${outputObject.task_id}`;
    }
  }

  const text = stringifyValue(output).trim();
  return text ? truncateText(text, 420) : undefined;
}

function stepsFromMetadata(metadata: string | null): ThinkingStepData[] {
  if (!metadata) return [];
  try {
    const msg = JSON.parse(metadata) as Record<string, unknown>;
    const directSteps = Array.isArray(msg.thinkingSteps) ? msg.thinkingSteps : null;
    if (directSteps) {
      return directSteps.filter((step): step is ThinkingStepData => {
        if (!step || typeof step !== "object") return false;
        const record = step as Record<string, unknown>;
        return typeof record.id === "string" && typeof record.title === "string";
      }).map((step) => {
        const record = step as unknown as Record<string, unknown>;
        return {
          id: record.id as string,
          title: record.title as string,
          status: record.status === "error" ? "error" : record.status === "running" ? "running" : "complete",
          tool: typeof record.tool === "string" ? record.tool : undefined,
          content: typeof record.content === "string" ? record.content : undefined,
          result: typeof record.result === "string" ? record.result : undefined,
          filename: typeof record.filename === "string" ? record.filename : undefined,
          filePath: typeof record.filePath === "string" ? record.filePath : undefined,
        };
      });
    }
    const parts = (msg.parts as unknown[]) ?? [];
    const steps: ThinkingStepData[] = [];

    for (const raw of parts) {
      const p = raw as Record<string, unknown>;
      const type = p.type as string | undefined;
      const id = (p.id as string | undefined) ?? Math.random().toString(36).slice(2);

      if (type === "tool") {
        const tool = (p.tool as string | undefined) ?? "tool";
        const state = (p.state as Record<string, unknown> | undefined) ?? {};
        const input = state.input as Record<string, unknown> | undefined;
        const filePath = toolFilePath(input);
        const basename = filePath ? pathBasename(filePath) : undefined;
        const title = toolTitle(tool, input, basename);
        const content = toolContent(tool, input);
        const result = toolResult(state);
        const fileContent = (tool === "write" || tool === "edit")
          && typeof input?.content === "string"
          ? input.content
          : undefined;
        const subagentType = tool === "task" || tool === "subtask" ? taskSubagentType(input) : undefined;
        const description = tool === "task" || tool === "subtask" ? taskDescription(input) : undefined;
        const prompt = tool === "task" || tool === "subtask" ? taskPrompt(input) : undefined;

        const status = state.status === "error" ? "error" : "complete";

        steps.push({
          id,
          title,
          tool,
          status,
          content,
          result,
          filename: basename,
          filePath,
          fileContent,
          subagentType,
          taskDescription: description,
          taskPrompt: prompt,
        });
      } else if (type === "reasoning") {
        const text = (p.text as string | undefined) ?? "";
        if (text.trim()) {
          steps.push({ id, title: "Thinking", tool: "reasoning", status: "complete", content: text, result: text });
        }
      } else if (type === "text") {
        const phase = ((p.metadata as Record<string, unknown>)?.openai as Record<string, unknown> | undefined)?.phase;
        if (phase === "commentary") {
          const text = (p.text as string | undefined) ?? "";
          if (text.trim()) {
            steps.push({ id, title: "Working", tool: "commentary", status: "complete", content: text, result: text });
          }
        }
      } else if (type === "subtask") {
        const input = {
          agent: p.agent,
          description: p.description,
          prompt: p.prompt,
        } as Record<string, unknown>;
        steps.push({
          id,
          title: toolTitle("subtask", input, undefined),
          tool: "subtask",
          status: "complete",
          content: toolContent("subtask", input),
          subagentType: taskSubagentType(input),
          taskDescription: taskDescription(input),
          taskPrompt: taskPrompt(input),
        });
      }
    }

    return steps;
  } catch {
    return [];
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center justify-center h-8 w-8 rounded-xl transition-all duration-200 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] active:scale-95"
      title={copied ? "Copied!" : "Copy message"}
    >
      {copied ? (
        <svg className="w-4 h-4 text-[var(--color-success)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

interface ChatMessageProps {
  message: Message & { thinkingSteps?: ThinkingStepData[] };
  isStreaming?: boolean;
  /** Workspace base path for resolving relative file paths in tool steps. */
  basePath?: string;
  /** Backend type to show appropriate logo/name. */
  backend?: BackendType;
}

function ChatMessageComponent({ message, isStreaming = false, basePath, backend = "khadim" }: ChatMessageProps) {
  const isUser = message.role === "user";
  const time = formatMessageTime(message.created_at);
  const hasContent = message.content.trim().length > 0;
  // Use live streaming steps if present; fall back to steps parsed from persisted metadata.
  const thinkingSteps = useMemo(
    () => (message.thinkingSteps && message.thinkingSteps.length > 0)
      ? message.thinkingSteps
      : stepsFromMetadata(message.metadata ?? null),
    [message.metadata, message.thinkingSteps],
  );

  if (!hasContent && thinkingSteps.length === 0 && !isUser) return null;

  // User message — typographic, flat, no bubble
  if (isUser) {
    return (
      <div className="animate-in group/msg">
        <div className="mb-1.5 flex items-center gap-2 md:mb-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--color-accent)] md:h-7 md:w-7">
            <span className="font-display text-[11px] font-semibold text-[var(--color-accent-ink)] md:text-xs">Y</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] md:text-[11px]">
            You
          </span>
          {time && (
            <span className="font-mono text-[10px] text-[var(--text-muted)] opacity-70 md:text-[11px]">
              · {time}
            </span>
          )}
        </div>
        <div className="pl-8 md:pl-9">
          <div className="whitespace-pre-wrap font-sans text-[15px] leading-[1.65] text-[var(--text-primary)] md:text-[16px] md:leading-[1.7]">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  const backendLabel = getBackendLabel(backend);
  const BackendLogo = backend === "opencode" ? OpenCodeLogo : KhadimLogo;

  return (
    <div className="animate-in group/msg">
      {/* Header: avatar + name + timestamp */}
      <div className="mb-1.5 flex items-center gap-2 md:mb-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-xs)] md:h-7 md:w-7">
          <div className="logo-adaptive h-full w-full text-[var(--color-accent)] [&>svg]:h-full [&>svg]:w-full">
            <BackendLogo />
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] md:text-[11px]">
          {backendLabel}
        </span>
        {time && (
          <span className="font-mono text-[10px] text-[var(--text-muted)] opacity-70 md:text-[11px]">
            · {time}
          </span>
        )}
      </div>

      {/* Message body */}
      <div className="pl-8 md:pl-9">
        {thinkingSteps.length > 0 && (
          <div className={hasContent ? "mb-4" : "mb-0"}>
            <ThinkingSteps steps={thinkingSteps} basePath={basePath} isStreaming={isStreaming} />
          </div>
        )}

        <div className={`font-sans text-[15px] leading-[1.7] md:text-[16px] md:leading-[1.75] ${isStreaming ? "streaming-cursor" : ""}`}>
          <MarkdownRenderer content={message.content} />
        </div>

        {/* Copy button — visible on hover */}
        {hasContent && !isStreaming && (
          <div className="mt-2 -ml-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-[var(--duration-base)] group-hover/msg:opacity-100">
            <CopyButton text={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);

export function TypingIndicator({ backend = "khadim" }: { backend?: BackendType }) {
  const backendLabel = getBackendLabel(backend);
  const BackendLogo = backend === "opencode" ? OpenCodeLogo : KhadimLogo;

  return (
    <div className="animate-in">
      <div className="mb-1.5 flex items-center gap-2 md:mb-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-xs)] md:h-7 md:w-7">
          <div className="logo-adaptive h-full w-full text-[var(--color-accent)] [&>svg]:h-full [&>svg]:w-full">
            <BackendLogo />
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] md:text-[11px]">
          {backendLabel}
        </span>
      </div>
      <div className="pl-8 md:pl-9">
        <div className="inline-flex items-center gap-1.5">
          <span className="typing-dot" style={{ animationDelay: "0ms" }} />
          <span className="typing-dot" style={{ animationDelay: "160ms" }} />
          <span className="typing-dot" style={{ animationDelay: "320ms" }} />
        </div>
      </div>
    </div>
  );
}
