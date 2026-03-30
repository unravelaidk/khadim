import { GameBoyScreen } from "./GameBoyScreen";
import { ChatMessage } from "./ChatMessage";
import { AgentQuestion } from "./AgentQuestion";
import type { Message, PendingQuestion } from "../../types/chat";

interface ChatInterfaceProps {
  messages: Message[];
  pendingQuestion: PendingQuestion | null;
  onAnswerQuestion: (answer: string) => void;
  onCancelQuestion: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  workspaceId?: string | null;
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

  return (
    <div className="mx-auto w-full max-w-5xl animate-in fade-in duration-500">
      <GameBoyScreen>
        <div className="space-y-6">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} workspaceId={workspaceId} />
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
    </div>
  );
}
