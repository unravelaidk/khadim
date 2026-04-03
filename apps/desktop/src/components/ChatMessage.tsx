import { useState, memo } from "react";
import KhadimLogo from "../assets/Khadim-logo.svg";
import type { ChatMessage as Message, ThinkingStepData } from "../lib/bindings";
import { formatMessageTime } from "../lib/ui";
import { ThinkingSteps } from "./ThinkingSteps";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center justify-center h-8 w-8 rounded-lg transition-all duration-200 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] active:scale-95"
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
}

function ChatMessageComponent({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === "user";
  const time = formatMessageTime(message.created_at);
  const hasContent = message.content.trim().length > 0;
  const thinkingSteps = message.thinkingSteps ?? [];

  if (!hasContent && thinkingSteps.length === 0 && !isUser) return null;

  // User message
  if (isUser) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex justify-end">
        <div className="flex items-start gap-2 md:gap-3 max-w-[92%] md:max-w-[80%]">
          <div className="flex flex-col items-end min-w-0">
            <span className="mb-1 flex items-center gap-1.5 px-1 text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)] md:text-[10px]">
              You
              {time && <span className="font-mono opacity-60">{time}</span>}
            </span>
            <div className="rounded-2xl rounded-tr-md border border-[var(--glass-border-strong)] bg-[var(--surface-ink-solid)] px-4 py-3 text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] md:px-5 md:py-3.5">
              <div className="text-sm leading-relaxed text-[var(--text-inverse)]">
                {message.content}
              </div>
            </div>
          </div>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)] md:h-8 md:w-8">
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
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg md:h-7 md:w-7 overflow-hidden">
          <div className="h-full w-full [&>svg]:w-full [&>svg]:h-full">
            <KhadimLogo />
          </div>
        </div>
        <span className="text-[11px] font-semibold text-[var(--text-primary)] md:text-xs tracking-wide">Khadim</span>
        {time && <span className="text-[9px] font-mono text-[var(--text-muted)] opacity-60 md:text-[10px]">{time}</span>}
      </div>

      {/* Message body */}
      <div className="pl-8 md:pl-9">
        {thinkingSteps.length > 0 && (
          <div className={hasContent ? "mb-4" : "mb-0"}>
            <ThinkingSteps steps={thinkingSteps} />
          </div>
        )}

        <div className={`prose-gb text-sm leading-[1.7] md:text-[0.9375rem] md:leading-[1.75] ${isStreaming ? "streaming-cursor" : ""}`}>
          {message.content.split("\n").map((line, i) => {
            if (line.startsWith("- ")) return <li key={i} className="ml-1">{line.slice(2)}</li>;
            if (line.startsWith("`") && line.endsWith("`") && line.length > 2) return <p key={i}><code>{line.slice(1, -1)}</code></p>;
            if (line.trim() === "") return <br key={i} />;
            return <p key={i}>{line}</p>;
          })}
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
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg overflow-hidden">
        <div className="h-full w-full [&>svg]:w-full [&>svg]:h-full"><KhadimLogo /></div>
      </div>
      <div className="flex flex-col items-start">
        <span className="mb-1 px-1 text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Khadim</span>
        <div className="rounded-2xl rounded-tl-md glass-card-static px-4 py-3">
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
