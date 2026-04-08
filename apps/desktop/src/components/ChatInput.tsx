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
    <div className="shrink-0 z-40 px-3 md:px-6 pt-2 pb-4">
      <div className="mx-auto max-w-5xl">
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

        <div className="relative group">
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
            placeholder={isProcessing ? "Keep typing..." : "Message..."}
            rows={1}
            className="flex min-h-[52px] w-full resize-none items-center rounded-3xl glass-panel-strong pl-5 pr-14 py-4 text-[15px] text-[var(--text-primary)] transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--glass-border-strong)] focus:ring-4 focus:ring-[var(--input-focus-ring)] focus:outline-none md:min-h-[58px] md:px-6 md:py-4 md:pr-14 md:text-base"
            style={{ maxHeight: "168px" }}
          />
          {isProcessing ? (
            <button
              onClick={onStop}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full btn-ink transition-all hover:scale-105 md:h-11 md:w-11"
              title="Stop generation"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!value.trim()}
              className={`absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition-all md:h-11 md:w-11 ${
                value.trim()
                  ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] hover:scale-105 hover:shadow-[var(--shadow-glass-md)]"
                  : "bg-[var(--glass-bg)] text-[var(--text-muted)] cursor-not-allowed"
              }`}
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-xs font-medium text-[var(--text-muted)]">
          {isProcessing ? "Click stop to cancel. Press Enter to queue your next thought." : "Press Enter to send, Shift+Enter for newline"}
        </p>
      </div>
    </div>
  );
}
