import { useState } from "react";

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
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-5 shadow-lg">
        {/* Question Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center text-white text-lg shadow-md">
            ❓
          </div>
          <div className="flex-1">
            <span className="text-xs font-mono uppercase tracking-wider text-amber-600 mb-1 block">
              Agent needs your input
            </span>
            <p className="text-gb-text font-medium text-lg leading-relaxed">
              {question}
            </p>
          </div>
        </div>

        {/* Context (if provided) */}
        {context && (
          <div className="mb-4 px-3 py-2 bg-amber-100/50 rounded-lg text-sm text-amber-700 border border-amber-200">
            💡 {context}
          </div>
        )}

        {/* Options (if provided) */}
        {options && options.length > 0 ? (
          <div className="space-y-2 mb-4">
            {options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleOptionClick(option)}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-amber-200 bg-white hover:bg-amber-50 hover:border-amber-400 transition-all duration-200 font-medium text-gb-text shadow-sm hover:shadow-md group"
              >
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-600 text-sm font-mono mr-3 group-hover:bg-amber-200 transition-colors">
                  {String.fromCharCode(65 + index)}
                </span>
                {option}
              </button>
            ))}
          </div>
        ) : null}

        {/* Free text input */}
        <div className="space-y-3">
          {options && options.length > 0 && (
            <div className="text-center text-sm text-amber-600 font-medium">
              — or type your own response —
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
              className="flex-1 px-4 py-3 rounded-xl border-2 border-amber-200 bg-white focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200 transition-all placeholder:text-amber-300"
            />
            <button
              onClick={handleSubmit}
              disabled={!textAnswer.trim()}
              className="px-5 py-3 rounded-xl bg-amber-400 text-white font-semibold hover:bg-amber-500 disabled:bg-amber-200 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg disabled:shadow-none"
            >
              Send
            </button>
          </div>
        </div>

        {/* Cancel button */}
        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-3 text-sm text-amber-600 hover:text-amber-700 underline underline-offset-2"
          >
            Skip this question
          </button>
        )}
      </div>
    </div>
  );
}

export default AgentQuestion;
