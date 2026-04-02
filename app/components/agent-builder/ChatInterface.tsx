import { useEffect, useMemo, useState } from "react";
import { GameBoyScreen } from "./GameBoyScreen";
import { ChatMessage } from "./ChatMessage";
import { AgentQuestion } from "./AgentQuestion";
import { FileEditorModal } from "./FileEditorModal";
import { WorkTimelineRow } from "./WorkTimelineRow";
import type { Message, PendingQuestion } from "../../types/chat";
import { deriveTimelineRows } from "./timeline";

interface ChatInterfaceProps {
  messages: Message[];
  pendingQuestion: PendingQuestion | null;
  onAnswerQuestion: (answer: string) => void;
  onCancelQuestion: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  workspaceId?: string | null;
  selectedSlideContent: string | null;
  onSelectSlideContent: (content: string | null) => void;
}

interface OpenFileInfo {
  filename: string;
  content: string;
}

export function ChatInterface({
  messages,
  pendingQuestion,
  onAnswerQuestion,
  onCancelQuestion,
  messagesEndRef,
  workspaceId,
  selectedSlideContent,
  onSelectSlideContent,
}: ChatInterfaceProps) {
  const hasMessages = messages.length > 0 || !!pendingQuestion;
  const [openFile, setOpenFile] = useState<OpenFileInfo | null>(null);
  const timelineRows = deriveTimelineRows(messages);
  const slideContents = useMemo(
    () => messages.map((message) => message.fileContent).filter((content): content is string => Boolean(content?.includes('<script id="slide-data"'))),
    [messages],
  );

  useEffect(() => {
    if (slideContents.length === 0) {
      if (selectedSlideContent !== null) {
        onSelectSlideContent(null);
      }
      return;
    }

    if (!selectedSlideContent || !slideContents.includes(selectedSlideContent)) {
      onSelectSlideContent(slideContents[slideContents.length - 1] || null);
    }
  }, [onSelectSlideContent, selectedSlideContent, slideContents]);

  return (
    <div className="mx-auto w-full max-w-5xl animate-in fade-in duration-500">
      <GameBoyScreen>
        <div className="space-y-6">
          {timelineRows.map((row) => {
            if (row.kind === "work") {
              return <WorkTimelineRow key={row.id} messages={row.messages} onOpenFile={setOpenFile} />;
            }

            return <ChatMessage key={row.id} message={row.message} workspaceId={workspaceId} onOpenFile={setOpenFile} />;
          })}
          {pendingQuestion && (
            <AgentQuestion
              question={pendingQuestion.question}
              options={pendingQuestion.options}
              context={pendingQuestion.context}
              onAnswer={onAnswerQuestion}
              onCancel={onCancelQuestion}
            />
          )}
          {!hasMessages && (
            <p className="text-center text-sm text-[var(--text-muted)]">Start a conversation to see chat activity here.</p>
          )}
          <div ref={messagesEndRef} />
        </div>
      </GameBoyScreen>

      <FileEditorModal
        isOpen={!!openFile}
        onClose={() => setOpenFile(null)}
        filename={openFile?.filename ?? ""}
        content={openFile?.content ?? ""}
      />
    </div>
  );
}
