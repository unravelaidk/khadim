import type { Message } from "./types";
import { ThinkingSteps } from "./ThinkingStep";
import type { ThinkingStepData } from "./ThinkingStep";
import { FileArtifact } from "./FileArtifact";
import Markdown from "react-markdown";

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
          <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert prose-headings:text-inherit prose-p:text-inherit prose-strong:text-inherit prose-code:text-gb-accent prose-code:bg-gb-bg prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-a:text-gb-accent">
            <Markdown>{message.content}</Markdown>
          </div>
        )}

        {!isUser && hasPreviewUrl && (
          <FileArtifact 
            filename="index.html" 
            content={message.fileContent || "// Code content not loaded for this version"} 
            previewUrl={message.previewUrl} 
          />
        )}

        {!hasContent && hasSteps && !hasPreviewUrl && (
          <div className="text-sm text-gb-text-muted italic">
            Working on it...
          </div>
        )}
      </div>
    </div>
  );
}
