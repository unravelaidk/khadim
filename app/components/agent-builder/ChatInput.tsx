import { useRef } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isProcessing?: boolean;
  activeAgent?: { mode: "plan" | "build"; name: string } | null;
  badges?: Array<{ label: string; icon: React.ReactNode; prompt?: string }>;
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isProcessing) {
        onSend();
      }
    }
  };

  const containerClasses = position === "fixed"
    ? "absolute bottom-0 left-0 right-0 pt-4 pb-6 px-3 md:pt-6 md:pb-8 md:px-4"
    : "w-full pt-4 pb-0";

  const containerStyle = position === "fixed"
    ? { background: "linear-gradient(to top, var(--color-gb-bg) 70%, transparent)" }
    : undefined;

  return (
    <div
      className={containerClasses}
      style={containerStyle}
    >
      <div className={`mx-auto ${isCompact ? "max-w-xl" : "max-w-3xl"}`}>
        {activeAgent && isProcessing && (
          <div className="flex justify-center mb-2">
            <div className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 ${activeAgent.mode === "plan"
                ? "bg-blue-100 text-blue-700 border border-blue-200"
                : "bg-green-100 text-green-700 border border-green-200"
              }`}>
              {activeAgent.mode === "plan" ? "🧠" : "🔨"} {activeAgent.name} Agent Active
            </div>
          </div>
        )}
        
        {/* Badges/Chips */}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 px-2">
            {badges.map((badge, index) => (
              <div 
                key={index} 
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gb-bg-subtle border border-gb-border rounded-full text-xs font-medium text-gb-text-secondary animate-in fade-in slide-in-from-bottom-2"
              >
                <span>{badge.icon}</span>
                <span>{badge.label}</span>
                {onRemoveBadge && (
                  <button 
                    onClick={() => onRemoveBadge(badge.label)}
                    className="ml-1 p-0.5 hover:text-gb-text hover:bg-gb-bg-card rounded-full transition-colors"
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
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isProcessing ? "Agent is working..." : "Type a message..."}
            rows={1}
            disabled={isProcessing}
            className={`w-full bg-gb-bg-card border border-gb-border rounded-2xl md:rounded-full px-4 md:px-6 py-3 md:py-4 pr-12 md:pr-14 resize-none focus:outline-none focus:ring-2 focus:ring-gb-primary/10 transition-all shadow-gb-sm hover:shadow-gb-md text-sm md:text-base text-gb-text placeholder:text-gb-text-muted min-h-[48px] md:min-h-[56px] flex items-center ${isProcessing ? 'opacity-60' : ''}`}
            style={{ maxHeight: "120px" }}
          />
          {isProcessing ? (
            <button
              onClick={onStop}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all bg-red-500 text-white hover:bg-red-600 hover:scale-105 active:scale-95"

              title="Stop generation"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!value.trim()}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all ${value.trim()
                  ? "bg-gb-text text-gb-text-inverse hover:scale-105 active:scale-95"
                  : "bg-gb-bg-subtle text-gb-text-muted cursor-not-allowed"
                  }`}

            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-xs text-center mt-3 text-gb-text-muted font-medium opacity-60">
          {isProcessing ? "Click stop to cancel" : "Press Enter to send"}
        </p>
      </div>
    </div>
  );
}
