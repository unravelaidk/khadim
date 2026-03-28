import type { Message } from "../../types/chat";
import { ThinkingSteps } from "./ThinkingStep";
import type { ThinkingStepData } from "../../types/chat";
import { FileArtifact } from "./FileArtifact";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { LuUser, LuBot, LuPresentation } from "react-icons/lu";

interface ChatMessageProps {
  message: Message;
  workspaceId?: string | null;
}

export function ChatMessage({ message, workspaceId }: ChatMessageProps) {
  const isUser = message.role === "user";
  const timestamp = message.timestamp instanceof Date
    ? message.timestamp
    : new Date(message.timestamp);
  const timeLabel = Number.isNaN(timestamp.getTime())
    ? ""
    : timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const steps: ThinkingStepData[] = (message.thinkingSteps || []).map(step => ({
    id: step.id,
    title: step.title,
    status: step.status,
    content: step.content,
    result: step.result,
    tool: step.tool,
    filename: step.filename,
    fileContent: step.fileContent,
  }));

  const hasSteps = steps.length > 0;
  const hasContent = message.content.trim().length > 0;
  const hasPreviewUrl = !!message.previewUrl;
  const isArtifactStreaming = steps.some((step) => step.status === "running");

  const hasSlideContent = message.fileContent?.includes('<script id="slide-data"') ?? false;
  const shouldShowArtifact = hasPreviewUrl || hasSlideContent;

  return (
    <div className={`animate-in fade-in slide-in-from-bottom-2 flex gap-2.5 duration-300 md:gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-black shadow-gb-sm md:h-8 md:w-8">
          <LuBot className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
        </div>
      )}

      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[92%] md:max-w-[80%]`}>
        <span className={`mb-1 flex items-center gap-1 px-1 text-[9px] font-medium uppercase tracking-wide text-black/50 md:text-[10px]`}>
          {isUser ? "You" : "Khadim"}
          {timeLabel && <span className="text-black/40">{timeLabel}</span>}
        </span>

        <div
          className={`px-4 py-3 transition-all duration-200 md:px-5 md:py-3.5 ${
            isUser
              ? "bg-black text-white shadow-gb-sm"
              : "bg-white border-2 border-black text-black shadow-gb-sm"
          }`}
        >
          {!isUser && hasSteps && (
            <div className={`${hasContent ? "mb-4" : ""}`}>
              <ThinkingSteps steps={steps} />
            </div>
          )}

          {hasContent && (
            <div className={`text-sm leading-relaxed ${!isUser ? "prose-gb" : "text-white/95"}`}>
              <MarkdownRenderer content={message.content} />
            </div>
          )}

          {!isUser && hasSlideContent && (
            <div className={`${hasContent ? "mt-3" : ""} flex items-center gap-2 border-2 border-black bg-[#e5ff00] px-3 py-2`}>
              <LuPresentation className="w-4 h-4 text-black flex-shrink-0" />
              <span className="text-xs font-medium text-black">Presentation updated</span>
              {isArtifactStreaming && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-black">
                  <span className="h-1.5 w-1.5 animate-pulse bg-black" />
                  Writing
                </span>
              )}
            </div>
          )}

          {!isUser && hasPreviewUrl && !hasSlideContent && (
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

      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 bg-white border-2 border-black flex items-center justify-center shadow-gb-sm">
          <LuUser className="w-3.5 h-3.5 md:w-4 md:h-4 text-black" />
        </div>
      )}
    </div>
  );
}
