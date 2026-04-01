import { useState } from "react";
import { GameBoyScreen } from "./GameBoyScreen";
import { ChatMessage } from "./ChatMessage";
import { AgentQuestion } from "./AgentQuestion";
import { FileEditorModal } from "./FileEditorModal";
import type { Message, PendingQuestion } from "../../types/chat";

interface ChatInterfaceProps {
  messages: Message[];
  pendingQuestion: PendingQuestion | null;
  onAnswerQuestion: (answer: string) => void;
  onCancelQuestion: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  workspaceId?: string | null;
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
}: ChatInterfaceProps) {
  const hasMessages = messages.length > 0 || !!pendingQuestion;
  const [openFile, setOpenFile] = useState<OpenFileInfo | null>(null);

  return (
    <div className="mx-auto w-full max-w-5xl animate-in fade-in duration-500">
      <GameBoyScreen>
        <div className="space-y-6">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} workspaceId={workspaceId} onOpenFile={setOpenFile} />
          ))}
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
