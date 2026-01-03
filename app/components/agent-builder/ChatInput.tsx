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
        <div className="relative rounded-2xl overflow-hidden transition-shadow focus-within:shadow-lg bg-gb-bg-card border border-gb-border shadow-gb-sm">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want your agent to do..."
            rows={1}
            className="w-full bg-transparent px-5 py-4 pr-14 resize-none focus:outline-none text-sm text-gb-text placeholder:text-gb-text-muted"
            style={{ maxHeight: "120px" }}
          />
          <button
            onClick={onSend}
            disabled={!value.trim()}
            className={`absolute right-3 bottom-3 w-9 h-9 rounded-xl flex items-center justify-center transition-all text-gb-text-inverse ${
              value.trim() ? "bg-gb-primary" : "bg-gb-border opacity-40"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-center mt-3 text-gb-text-muted">
          Press Enter to send
        </p>
      </div>
    </div>
  );
}
