import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isProcessing?: boolean;
  activeAgent?: { mode: "plan" | "build"; name: string } | null;
  badges?: Array<{ label: string; icon: ReactNode; prompt?: string }>;
  onRemoveBadge?: (label: string) => void;
  isCompact?: boolean;
  position?: "fixed" | "relative";
}

export function ChatInput({
  value = "",
  onChange,
  onSend,
  onStop,
  isProcessing = false,
  activeAgent,
  badges = [],
  onRemoveBadge,
  isCompact = false,
  position = "fixed"
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = () => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 168)}px`;
  };

  useEffect(() => {
    resizeTextarea();
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isProcessing && value.trim()) {
        onSend();
      }
    }
  };

  const isFixed = position === "fixed";
  const containerClasses = isFixed
    ? "absolute bottom-0 left-0 right-0 px-3 pb-5 pt-4 sm:px-4 sm:pb-7 sm:pt-5 md:px-6 md:pb-9 md:pt-7"
    : "w-full pt-4 pb-0";

  const containerStyle = isFixed
    ? { background: "linear-gradient(to top, #fafafa 70%, transparent)" }
    : undefined;

  return (
    <div
      className={containerClasses}
      style={containerStyle}
    >
      <div className={`mx-auto ${isCompact ? "max-w-xl" : "max-w-4xl"}`}>
        {activeAgent && isProcessing && (
          <div className="mb-2 flex justify-center">
            <div className={`flex items-center gap-2 border-2 px-3 py-1 text-xs font-medium shadow-gb-sm ${activeAgent.mode === "plan"
                ? "border-black bg-white text-black/70"
                : "border-black bg-[#e5ff00] text-black"
              }`}>
              {activeAgent.mode === "plan" ? "🧠" : "🔨"} {activeAgent.name} Agent Active
            </div>
          </div>
        )}
        
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 px-2">
            {badges.map((badge, index) => (
              <div 
                key={index} 
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-2 border-black text-xs font-medium text-black shadow-gb-sm animate-in fade-in slide-in-from-bottom-2"
              >
                <span>{badge.icon}</span>
                <span>{badge.label}</span>
                {onRemoveBadge && (
                  <button 
                    onClick={() => onRemoveBadge(badge.label)}
                    className="ml-1 p-0.5 hover:bg-black hover:text-white transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="relative group">
            <textarea
              ref={inputRef}
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                resizeTextarea();
              }}
              onKeyDown={handleKeyDown}
              placeholder={isProcessing ? "Agent is working... you can keep typing" : "Type a message..."}
              rows={1}
              className="flex min-h-[52px] w-full resize-none items-center border-2 border-black bg-white px-4 py-3 pr-12 text-sm text-black transition-all placeholder:text-black/40 focus:border-black focus:outline-none md:min-h-[58px] md:px-6 md:py-4 md:pr-14 md:text-base shadow-gb-sm"

            style={{ maxHeight: "168px" }}
            aria-label="Chat message input"
            />
          {isProcessing ? (
            <button
              onClick={onStop}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center bg-black text-white transition-all hover:bg-black/80 shadow-gb-sm md:h-10 md:w-10"
              title="Stop generation"
              aria-label="Stop generation"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
                onClick={onSend}
                disabled={!value.trim()}
                className={`absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center transition-all shadow-gb-sm md:h-10 md:w-10 ${value.trim()
                ? "bg-black text-white hover:bg-black/80"
                : "bg-white text-black/30 cursor-not-allowed border-2 border-black"
                }`}
                aria-label="Send message"
              >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        <p className="mt-3 text-center text-xs font-medium text-black/50">
          {isProcessing ? "Click stop to cancel. Press Enter to queue your next thought." : "Press Enter to send, Shift+Enter for newline"}
        </p>
      </div>
    </div>
  );
}