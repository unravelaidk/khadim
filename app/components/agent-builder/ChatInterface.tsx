import { GameBoyScreen } from "./GameBoyScreen";
import { ChatMessage } from "./ChatMessage";
import { TypingIndicator } from "./TypingIndicator";
import { AgentQuestion } from "./AgentQuestion";
import type { Message, PendingQuestion } from "../../types/chat";

interface ChatInterfaceProps {
  messages: Message[];
  isTyping: boolean;
  pendingQuestion: PendingQuestion | null;
  onAnswerQuestion: (answer: string) => void;
  onCancelQuestion: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatInterface({
  messages,
  isTyping,
  pendingQuestion,
  onAnswerQuestion,
  onCancelQuestion,
  messagesEndRef,
}: ChatInterfaceProps) {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 animate-in fade-in duration-500">
      <GameBoyScreen>
        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {isTyping && <TypingIndicator />}
          {pendingQuestion && (
            <AgentQuestion
              question={pendingQuestion.question}
              options={pendingQuestion.options}
              context={pendingQuestion.context}
              onAnswer={onAnswerQuestion}
              onCancel={onCancelQuestion}
            />
          )}
          <div ref={messagesEndRef} />
        </div>
      </GameBoyScreen>
    </div>
  );
}
