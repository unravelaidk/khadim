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
      <div className="overflow-hidden rounded-2xl border border-[var(--glass-border)] glass-card-static shadow-[var(--shadow-glass-sm)]">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-4 py-3">
          <div className="h-2 w-2 rounded-full bg-[#10150a]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Input Required
          </span>
          {onCancel && (
            <button
              onClick={onCancel}
              className="ml-auto p-1 rounded-md hover:bg-[var(--glass-bg-strong)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="Skip this question"
            >
              <LuX className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-4 space-y-4">
          {/* Question */}
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#10150a] shadow-sm">
              <LuMessageCircleQuestion className="w-4 h-4 text-[var(--text-inverse)]" />
            </div>
            <p className="text-[var(--text-primary)] font-medium text-base leading-relaxed pt-1.5">
              {question}
            </p>
          </div>

          {/* Context (if provided) */}
          {context && (
            <div className="flex items-start gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
              <LuLightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
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
                  className="group w-full rounded-xl border border-[var(--glass-border)] glass-card-static px-4 py-3 text-left font-medium text-[var(--text-primary)] transition-all duration-200 hover:bg-[var(--glass-bg)]"
                >
                  <span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--glass-bg)] text-sm font-mono text-[var(--text-secondary)] transition-colors group-hover:bg-[var(--surface-bg)] group-hover:text-[var(--text-primary)]">
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
              <div className="text-center text-xs text-[var(--text-muted)] font-medium py-1">
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
                className="flex-1 rounded-xl border border-[var(--glass-border)] glass-card-static px-4 py-2.5 text-sm transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--glass-border-strong)] focus:outline-none focus:ring-2 focus:ring-black/5"
                autoFocus
              />
              <button
                onClick={handleSubmit}
                disabled={!textAnswer.trim()}
                className="flex items-center gap-2 rounded-xl bg-[#10150a] px-4 py-2.5 font-medium text-[var(--text-inverse)] transition-all hover:bg-[#1c2214] disabled:cursor-not-allowed disabled:bg-[var(--glass-bg)] disabled:text-[var(--text-muted)]"
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
