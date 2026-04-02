import { memo } from "react";
import type { Message } from "../../types/chat";
import { FileArtifact } from "./FileArtifact";
import { MarkdownRenderer } from "./MarkdownRenderer";
import KhadimLogo from "../../assets/Khadim-logo.svg";

interface ChatMessageProps {
  message: Message;
  workspaceId?: string | null;
  onOpenFile?: (info: { filename: string; content: string }) => void;
}

function ChatMessageComponent({ message, workspaceId, onOpenFile }: ChatMessageProps) {
  const isUser = message.role === "user";
  const timestamp = message.timestamp instanceof Date
    ? message.timestamp
    : new Date(message.timestamp);
  const timeLabel = Number.isNaN(timestamp.getTime())
    ? ""
    : timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const hasContent = message.content.trim().length > 0;
  const hasPreviewUrl = !!message.previewUrl;
  const isArtifactStreaming = (message.thinkingSteps || []).some((step) => step.status === "running");
  const hasSlideContent = message.fileContent?.includes('<script id="slide-data"') ?? false;
  const shouldShowArtifact = hasPreviewUrl && !hasSlideContent;

  if (!hasContent && !shouldShowArtifact && !isUser) {
    return null;
  }

  return (
    <div className={`animate-in fade-in slide-in-from-bottom-2 flex gap-2.5 duration-300 md:gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {/* Khadim avatar */}
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg md:h-8 md:w-8 overflow-hidden">
          <div className="h-full w-full [&>svg]:w-full [&>svg]:h-full">
            <KhadimLogo />
          </div>
        </div>
      )}

      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[92%] md:max-w-[80%] min-w-0 w-full`}>
        <span className="mb-1 flex items-center gap-1.5 px-1 text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)] md:text-[10px]">
          {isUser ? "You" : "Khadim"}
          {timeLabel && <span className="font-mono opacity-60">{timeLabel}</span>}
        </span>

        <div
          className={`overflow-hidden transition-all duration-200 ${
            isUser
              ? "rounded-2xl rounded-tr-md border border-[var(--glass-border-strong)] bg-[#10150a] px-4 py-3 text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] md:px-5 md:py-3.5"
              : "rounded-2xl rounded-tl-md glass-card-static px-4 py-3 md:px-5 md:py-3.5"
          }`}
        >
          {hasContent && (
            <div className={`text-sm leading-relaxed ${!isUser ? "prose-gb" : "text-[var(--text-inverse)]"}`}>
              <MarkdownRenderer content={message.content} />
            </div>
          )}

          {!isUser && shouldShowArtifact && (
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
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)] md:h-8 md:w-8">
          <span className="font-display text-[11px] font-bold text-[var(--color-accent-ink)] md:text-xs">Y</span>
        </div>
      )}
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);
