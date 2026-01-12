import { useRef, useEffect } from "react";
import {
  GameBoyScreen,
  ChatMessage,
  TypingIndicator,
  SuggestionCards,
  AgentQuestion,
} from "./index";
import type { Message, PendingQuestion } from "../../types/chat";
import KhadimLogo from "../../assets/Khadim-logo.svg";

interface ChatViewProps {
  messages: Message[];
  isTyping: boolean;
  isInitialState: boolean;
  activeAgent: { mode: "plan" | "build"; name: string } | null;
  pendingQuestion: PendingQuestion | null;
  onAnswerQuestion: (answer: string) => void;
  onCancelQuestion: () => void;
  onSuggestionClick: (feature: { label: string; icon: React.ReactNode; prompt?: string }) => void;
}

export function ChatView({
  messages,
  isTyping,
  isInitialState,
  activeAgent,
  pendingQuestion,
  onAnswerQuestion,
  onCancelQuestion,
  onSuggestionClick,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, pendingQuestion]);

  return (
    <main
      className={`flex-1 overflow-y-auto ${
        isInitialState ? "flex items-center justify-center py-8" : "pt-8 pb-36 px-4"
      }`}
    >
      {!isInitialState && (
        <div className="w-full max-w-3xl mx-auto animate-in fade-in duration-500">
          <GameBoyScreen>
            <div className="space-y-6">
              {messages
                .filter((m) => m.id !== "welcome")
                .map((message) => (
                  <ChatMessage
                    // The fix: include step count in key to force re-render when steps update
                    key={`${message.id}-${message.thinkingSteps?.length || 0}`}
                    message={message}
                  />
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
      )}

      {isInitialState && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] w-full max-w-3xl mx-auto space-y-6 animate-in fade-in duration-700">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gb-bg-card border border-gb-border shadow-sm text-xs font-mono font-medium text-gb-text-secondary uppercase tracking-wider">
            <span className="text-gb-text-muted">TURN 1</span>
            <span className="w-px h-3 bg-gb-border"></span>
            <span className="text-gb-accent hover:underline cursor-pointer animate-pulse">
              ROLL DICE
            </span>
          </div>

          {/* Header - Logo & Subtitle */}
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 animate-in fade-in zoom-in duration-1000 text-center md:text-left mb-2 md:mb-0">
            <div className="w-24 h-24 md:w-32 md:h-32 text-gb-text animate-float">
               <KhadimLogo class="w-full h-full" />
            </div>
            <p className="text-xl md:text-2xl font-mono text-gb-text-secondary tracking-wide max-w-[200px] md:max-w-none">
              Get started building
            </p>
          </div>

          {/* Assistant Message Bubble */}
          <div className="relative group max-w-2xl px-8 py-6 rounded-2xl bg-gb-bg-subtle border border-gb-border shadow-sm">
            <p className="text-base text-gb-text-secondary text-center leading-relaxed whitespace-pre-wrap">
              {messages[0].content}
            </p>
          </div>

          <SuggestionCards
            prompts={['Build a classic Snake game', 'Create a simple landing page', 'Design a dashboard layout', 'Help me write a blog post']}
            onSelect={onSuggestionClick}
          />
        </div>
      )}
    </main>
  );
}
