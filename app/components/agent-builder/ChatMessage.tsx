import type { Message } from "../../types/chat";
import { ThinkingSteps } from "./ThinkingStep";
import type { ThinkingStepData } from "../../types/chat";
import { FileArtifact } from "./FileArtifact";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { LuUser, LuBot } from "react-icons/lu";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  const steps: ThinkingStepData[] = (message.thinkingSteps || []).map(step => ({
    id: step.id,
    title: step.title,
    status: step.status,
    content: step.content,
    result: step.result,
  }));

  const hasSteps = steps.length > 0;
  const hasContent = message.content.trim().length > 0;
  const hasPreviewUrl = !!message.previewUrl;

  const hasSlideContent = message.fileContent?.includes('<script id="slide-data"') ?? false;
  const shouldShowArtifact = hasPreviewUrl || hasSlideContent;

  // Debug logging
  if (!isUser) {
    console.log("[ChatMessage] Render - Steps:", steps.length, "hasSteps:", hasSteps, "hasContent:", hasContent);
    if (steps.length > 0) {
      console.log("[ChatMessage] Step details:", steps.map(s => `${s.id}(${s.status}): ${(s.content || '').slice(0, 30)}`));
    }
  }

  return (
    <div className={`flex gap-2 md:gap-3 ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-gb-primary to-gb-accent flex items-center justify-center shadow-sm">
          <LuBot className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
        </div>
      )}

      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[92%] md:max-w-[80%]`}>
        <span className={`text-[9px] md:text-[10px] font-semibold uppercase tracking-wider mb-1 px-1 ${
          isUser ? "text-gb-text-muted" : "text-gb-text-secondary"
        }`}>
          {isUser ? "You" : "Khadim"}
        </span>

        <div
          className={`px-3 md:px-4 py-2.5 md:py-3 rounded-2xl shadow-sm transition-all duration-200 hover:shadow-md ${
            isUser
              ? "rounded-br-md bg-gradient-to-br from-gb-primary to-gb-primary/90 text-gb-text-inverse"
              : "rounded-bl-md bg-gb-bg-card border border-gb-border/50 text-gb-text"
          }`}
        >
          {!isUser && hasSteps && (
            <div className={`${hasContent ? "mb-4" : ""}`}>
              <ThinkingSteps steps={steps} />
            </div>
          )}

          {hasContent && (
            <div className={`text-sm leading-relaxed ${!isUser ? "prose-gb" : ""}`}>
              <MarkdownRenderer content={message.content} />
            </div>
          )}

          {!isUser && shouldShowArtifact && (
            <div className={`${hasContent ? "mt-4" : ""}`}>
              <FileArtifact
                filename="index.html"
                content={message.fileContent || "// Code content not loaded for this version"}
                previewUrl={message.previewUrl}
              />
            </div>
          )}

        </div>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full bg-gb-bg-subtle border border-gb-border flex items-center justify-center">
          <LuUser className="w-3.5 h-3.5 md:w-4 md:h-4 text-gb-text-secondary" />
        </div>
      )}
    </div>
  );
}
