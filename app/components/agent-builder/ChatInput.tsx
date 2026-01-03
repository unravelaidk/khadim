import { useRef } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isCompact?: boolean;
  position?: "fixed" | "relative";
}

export function ChatInput({ 
  value, 
  onChange, 
  onSend, 
  isCompact = false,
  position = "fixed"
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const containerClasses = position === "fixed" 
    ? "absolute bottom-0 left-0 right-0 pt-6 pb-8 px-4"
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
        <div className="relative group">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="w-full bg-gb-bg-card border border-gb-border rounded-full px-6 py-4 pr-14 resize-none focus:outline-none focus:ring-2 focus:ring-gb-primary/10 transition-all shadow-gb-sm hover:shadow-gb-md text-sm text-gb-text placeholder:text-gb-text-muted min-h-[56px] flex items-center"
            style={{ maxHeight: "120px" }}
          />
          <button
            onClick={onSend}
            disabled={!value.trim()}
            className={`absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              value.trim() 
                ? "bg-gb-text text-gb-text-inverse hover:scale-105 active:scale-95" 
                : "bg-gb-bg-subtle text-gb-text-muted cursor-not-allowed"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-center mt-3 text-gb-text-muted font-medium opacity-60">
          Press Enter to send
        </p>
      </div>
    </div>
  );
}
