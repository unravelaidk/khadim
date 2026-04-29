import { memo, useState, useCallback } from "react";
import type { Message } from "../../types/chat";
import { FileArtifact } from "./FileArtifact";
import { MarkdownRenderer } from "./MarkdownRenderer";
import KhadimLogo from "../../assets/Khadim-logo.svg";

const COPY_RESET_DELAY = 2000;
const SLIDE_DATA_SCRIPT_RE = /<script\s+[^>]*id=["']slide-data["'][^>]*>/i;

interface ChatMessageProps {
  message: Message;
  workspaceId?: string | null;
  onOpenFile?: (info: { filename: string; content: string }) => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_RESET_DELAY);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_RESET_DELAY);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center justify-center h-8 w-8 rounded-lg transition-all duration-200 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] active:scale-95"
      title={copied ? "Copied!" : "Copy message"}
      aria-label={copied ? "Copied!" : "Copy message"}
    >
      {copied ? (
        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
}

function ChatMessageComponent({ message, workspaceId, onOpenFile }: ChatMessageProps) {
  const isUser = message.role === "user";
  const timestamp =
    message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp);
  const timeLabel = Number.isNaN(timestamp.getTime())
    ? ""
    : timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const hasContent = message.content.trim().length > 0;
  const hasPreviewUrl = !!message.previewUrl;
  const isArtifactStreaming = (message.thinkingSteps || []).some(
    (step) => step.status === "running",
  );
  const hasSlideContent =
    Boolean(message.fileContent && SLIDE_DATA_SCRIPT_RE.test(message.fileContent));
  const shouldShowArtifact = hasPreviewUrl && !hasSlideContent;

  if (!hasContent && !shouldShowArtifact && !isUser) {
    return null;
  }

  // ── User message ──────────────────────────────────────────────
  if (isUser) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 group/msg">
        <div className="mb-1.5 flex items-center gap-2 md:mb-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--color-accent)] md:h-7 md:w-7">
            <span className="font-display text-[11px] font-bold text-[var(--color-accent-ink)] md:text-xs">
              Y
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] md:text-[11px]">
            You
          </span>
          {timeLabel && (
            <span className="font-mono text-[10px] text-[var(--text-muted)] opacity-70 md:text-[11px]">
              {timeLabel}
            </span>
          )}
        </div>
        <div className="pl-8 md:pl-9">
          {hasContent && (
            <div className="whitespace-pre-wrap text-sm leading-[1.65] text-[var(--text-primary)] md:text-base md:leading-[1.7]">
              <MarkdownRenderer content={message.content} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Assistant message (Claude/ChatGPT style) ─────────────────
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 group/msg">
      {/* Header row: avatar + name + timestamp */}
      <div className="flex items-center gap-2 mb-1.5 md:mb-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg md:h-7 md:w-7 overflow-hidden">
          <div className="h-full w-full [&>svg]:w-full [&>svg]:h-full">
            <KhadimLogo />
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] md:text-[11px]">
          Khadim
        </span>
        {timeLabel && (
          <span className="font-mono text-[10px] text-[var(--text-muted)] opacity-70 md:text-[11px]">
            {timeLabel}
          </span>
        )}
      </div>

      {/* Message body — full width, no bubble on mobile */}
      <div className="pl-8 md:pl-9">
        {hasContent && (
          <div className="prose-gb text-sm leading-[1.7] md:text-base md:leading-[1.75]">
            <MarkdownRenderer content={message.content} />
          </div>
        )}

        {shouldShowArtifact && (
          <div className={`${hasContent ? "mt-4" : ""}`}>
            <FileArtifact
              filename="index.html"
              content={message.fileContent || "// Code content not loaded for this version"}
              previewUrl={message.previewUrl}
              isStreaming={isArtifactStreaming}
              workspaceId={workspaceId}
            />
          </div>
        )}

        {/* Action bar — copy button */}
        {hasContent && (
          <div className="flex items-center gap-0.5 mt-1.5 -ml-2 opacity-100 md:opacity-0 md:group-hover/msg:opacity-100 transition-opacity duration-200">
            <CopyButton text={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);
