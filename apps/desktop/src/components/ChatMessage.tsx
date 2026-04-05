import { useMemo, useState, memo } from "react";
import KhadimLogo from "../assets/Khadim-logo.svg";
import type { ChatMessage as Message, ThinkingStepData } from "../lib/bindings";
import { formatMessageTime } from "../lib/ui";
import { ThinkingSteps } from "./ThinkingSteps";
import { MarkdownRenderer } from "./MarkdownRenderer";

/** Reconstruct tool-call steps from the raw OpenCode message JSON stored in metadata. */
function stepsFromMetadata(metadata: string | null): ThinkingStepData[] {
  if (!metadata) return [];
  try {
    const msg = JSON.parse(metadata) as Record<string, unknown>;
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
        const filename = (input?.filePath ?? input?.path) as string | undefined;
        const basename = filename ? filename.split("/").pop() : undefined;

        const title = filename
          ? tool === "read"  ? `Reading ${basename}`
          : tool === "write" ? `Writing ${basename}`
          : `${tool.replace(/_/g, " ")} ${basename}`
          : tool === "bash" ? "Running command"
          : tool.replace(/_/g, " ");

        const content = input
          ? (input.command as string | undefined) ?? (input.filePath as string | undefined) ?? JSON.stringify(input, null, 2)
          : undefined;

        const result = typeof state.output === "string"
          ? state.output
          : state.output != null
          ? JSON.stringify(state.output, null, 2)
          : undefined;

        const status = state.status === "error" ? "error" : "complete";

        steps.push({ id, title, tool, status, content, result, filename: basename, filePath: filename });
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
}

function ChatMessageComponent({ message, isStreaming = false, basePath }: ChatMessageProps) {
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

  // User message
  if (isUser) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex justify-end">
        <div className="flex items-start gap-2 md:gap-3 max-w-[92%] md:max-w-[80%]">
          <div className="flex flex-col items-end min-w-0">
            <span className="mb-1 flex items-center gap-1.5 px-1 text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)] md:text-[10px]">
              You
              {time && <span className="font-mono opacity-80">{time}</span>}
            </span>
            <div className="rounded-3xl rounded-tr-lg border border-[var(--glass-border-strong)] bg-[var(--surface-ink-solid)] px-4 py-3 text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] md:px-5 md:py-3.5">
              <div className="text-sm leading-relaxed text-[var(--text-inverse)]">
                {message.content}
              </div>
            </div>
          </div>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)] md:h-8 md:w-8">
            <span className="font-display text-[11px] font-bold text-[var(--color-accent-ink)] md:text-xs">Y</span>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 group/msg">
      {/* Header: avatar + name + timestamp */}
      <div className="flex items-center gap-2 mb-1.5 md:mb-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl md:h-7 md:w-7 overflow-hidden">
          <div className="logo-adaptive h-full w-full [&>svg]:w-full [&>svg]:h-full text-[var(--text-primary)]">
            <KhadimLogo />
          </div>
        </div>
        <span className="text-[11px] font-semibold text-[var(--text-primary)] md:text-xs tracking-wide">Khadim</span>
        {time && <span className="text-[9px] font-mono text-[var(--text-muted)] opacity-80 md:text-[10px]">{time}</span>}
      </div>

      {/* Message body */}
      <div className="pl-8 md:pl-9">
        {thinkingSteps.length > 0 && (
          <div className={hasContent ? "mb-4" : "mb-0"}>
            <ThinkingSteps steps={thinkingSteps} basePath={basePath} isStreaming={isStreaming} />
          </div>
        )}

        <div className={`text-sm leading-[1.7] md:text-[0.9375rem] md:leading-[1.75] ${isStreaming ? "streaming-cursor" : ""}`}>
          <MarkdownRenderer content={message.content} />
        </div>

        {/* Copy button — visible on hover */}
        {hasContent && !isStreaming && (
          <div className="flex items-center gap-0.5 mt-1.5 -ml-2 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200">
            <CopyButton text={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);

export function TypingIndicator() {
  return (
    <div className="flex gap-2.5 justify-start animate-in fade-in duration-300">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl overflow-hidden">
        <div className="logo-adaptive h-full w-full [&>svg]:w-full [&>svg]:h-full text-[var(--text-primary)]"><KhadimLogo /></div>
      </div>
      <div className="flex flex-col items-start">
        <span className="mb-1 px-1 text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Khadim</span>
        <div className="rounded-3xl rounded-tl-lg glass-card-static px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--text-muted)] animate-bounce [animation-delay:-0.3s]" />
            <span className="h-2 w-2 rounded-full bg-[var(--text-secondary)] animate-bounce [animation-delay:-0.15s]" />
            <span className="h-2 w-2 rounded-full bg-[var(--text-primary)] animate-bounce" />
          </div>
        </div>
      </div>
    </div>
  );
}
