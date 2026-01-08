import type { Message } from "../../types/chat";
import { ThinkingSteps } from "./ThinkingStep";
import type { ThinkingStepData } from "../../types/chat";
import { FileArtifact } from "./FileArtifact";
import { MarkdownRenderer } from "./MarkdownRenderer";

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
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl ${
          isUser 
            ? "rounded-br-md bg-gb-primary text-gb-text-inverse" 
            : "rounded-bl-md bg-gb-bg-subtle text-gb-text"
        }`}
      >
        {!isUser && hasSteps && (
          <div className="mb-3 border-b border-gb-border pb-3">
            <ThinkingSteps steps={steps} />
          </div>
        )}

        {hasContent && (
          <div className="text-sm leading-relaxed">
            <MarkdownRenderer content={message.content} />
          </div>
        )}

        {!isUser && shouldShowArtifact && (
          <FileArtifact 
            filename="index.html" 
            content={message.fileContent || "// Code content not loaded for this version"} 
            previewUrl={message.previewUrl} 
          />
        )}

        {!hasContent && hasSteps && !shouldShowArtifact && (
          <div className="text-sm text-gb-text-muted italic">
            Working on it...
          </div>
        )}
      </div>
    </div>
  );
}
