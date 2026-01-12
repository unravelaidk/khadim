import { useState } from "react";
import { LuMessageCircleQuestion, LuLightbulb, LuSend, LuX } from "react-icons/lu";

interface AgentQuestionProps {
  question: string;
  options?: string[];
  context?: string;
  onAnswer: (answer: string) => void;
  onCancel?: () => void;
}

/**
 * AgentQuestion Component
 * Displays a question from the agent with optional multiple choice options
 * Styled to match the GameBoy aesthetic
 */
export function AgentQuestion({ question, options, context, onAnswer, onCancel }: AgentQuestionProps) {
  const [textAnswer, setTextAnswer] = useState("");

  const handleSubmit = () => {
    if (textAnswer.trim()) {
      onAnswer(textAnswer.trim());
      setTextAnswer("");
    }
  };

  const handleOptionClick = (option: string) => {
    onAnswer(option);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-gradient-to-b from-gb-bg-card to-gb-bg-subtle border border-gb-border rounded-xl overflow-hidden shadow-[var(--shadow-gb-md)]">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gb-accent/5 border-b border-gb-border">
          <div className="w-2 h-2 rounded-full bg-gb-accent animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-gb-accent">
            Input Required
          </span>
          {onCancel && (
            <button
              onClick={onCancel}
              className="ml-auto p-1 rounded-md hover:bg-gb-border/50 text-gb-text-muted hover:text-gb-text transition-colors"
              title="Skip this question"
            >
              <LuX className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-4 space-y-4">
          {/* Question */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-gb-primary to-gb-accent flex items-center justify-center shadow-sm">
              <LuMessageCircleQuestion className="w-4 h-4 text-white" />
            </div>
            <p className="text-gb-text font-medium text-base leading-relaxed pt-1.5">
              {question}
            </p>
          </div>

          {/* Context (if provided) */}
          {context && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-gb-bg-subtle rounded-lg text-sm text-gb-text-secondary border border-gb-border/50">
              <LuLightbulb className="w-4 h-4 text-gb-accent flex-shrink-0 mt-0.5" />
              <span>{context}</span>
            </div>
          )}

          {/* Options (if provided) */}
          {options && options.length > 0 && (
            <div className="space-y-2">
              {options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleOptionClick(option)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gb-border bg-gb-bg-card hover:bg-gb-bg-subtle hover:border-gb-border-medium transition-all duration-200 font-medium text-gb-text group"
                >
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gb-bg-subtle text-gb-text-secondary text-sm font-mono mr-3 group-hover:bg-gb-accent group-hover:text-white transition-colors">
                    {String.fromCharCode(65 + index)}
                  </span>
                  {option}
                </button>
              ))}
            </div>
          )}

          {/* Free text input */}
          <div className="space-y-2">
            {options && options.length > 0 && (
              <div className="text-center text-xs text-gb-text-muted font-medium py-1">
                or type a custom response
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && textAnswer.trim()) {
                    handleSubmit();
                  }
                }}
                placeholder="Type your answer..."
                className="flex-1 px-4 py-2.5 rounded-lg border border-gb-border bg-gb-bg-card focus:border-gb-primary focus:outline-none focus:ring-2 focus:ring-gb-primary/10 transition-all placeholder:text-gb-text-muted text-sm"
              />
              <button
                onClick={handleSubmit}
                disabled={!textAnswer.trim()}
                className="px-4 py-2.5 rounded-lg bg-gb-primary text-white font-medium hover:bg-gb-primary/90 disabled:bg-gb-border disabled:text-gb-text-muted disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <LuSend className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentQuestion;
