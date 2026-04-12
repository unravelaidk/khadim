import type { OpenCodeModelOption } from "../lib/bindings";
import { useEffect, useRef } from "react";
import { ModelSelector } from "./ModelSelector";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isProcessing: boolean;
  availableModels?: OpenCodeModelOption[];
  selectedModelKey?: string | null;
  onSelectModel?: (key: string) => void;
  modelDisabled?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isProcessing,
  availableModels = [],
  selectedModelKey = null,
  onSelectModel,
  modelDisabled = false,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 168) + "px";
    }
  }, [value]);

  return (
    <div className="shrink-0 z-40 px-4 md:px-6 pt-2 pb-5">
      <div className="mx-auto max-w-3xl">
        {availableModels.length > 0 && onSelectModel && (
          <div className="mb-2 px-1">
            <ModelSelector
              models={availableModels}
              selectedModelKey={selectedModelKey}
              onSelectModel={onSelectModel}
              disabled={modelDisabled}
              direction="up"
              className="w-56 max-w-full"
            />
          </div>
        )}

        <div className="group relative rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--surface-card)] transition-[border-color,box-shadow] duration-[var(--duration-base)] focus-within:border-[var(--color-accent-muted)] focus-within:shadow-[0_0_0_4px_var(--color-accent-subtle)]">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (value.trim()) onSend();
              }
            }}
            placeholder={isProcessing ? "Keep typing…" : "Message Khadim"}
            rows={1}
            className="block w-full resize-none bg-transparent px-5 py-4 pr-14 font-sans text-[15px] leading-[1.55] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none md:px-6 md:py-[18px] md:pr-16 md:text-[16px]"
            style={{ minHeight: "56px", maxHeight: "168px" }}
          />
          {isProcessing ? (
            <button
              onClick={onStop}
              aria-label="Stop generation"
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-danger-border)] bg-[var(--color-danger-muted)] text-[var(--color-danger-text)] transition-all duration-[var(--duration-fast)] hover:bg-[var(--color-danger-bg-strong)] active:scale-95 md:h-11 md:w-11"
              title="Stop generation"
            >
              <svg className="h-[14px] w-[14px]" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!value.trim()}
              aria-label="Send message"
              className={`absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full transition-all duration-[var(--duration-fast)] md:h-11 md:w-11 ${
                value.trim()
                  ? "btn-accent"
                  : "bg-[var(--glass-bg)] text-[var(--text-muted)] cursor-not-allowed"
              }`}
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </div>
        <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {isProcessing ? "Stop to cancel · Enter queues next turn" : "Enter to send · Shift+Enter new line"}
        </p>
      </div>
    </div>
  );
}
