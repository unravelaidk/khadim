import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { LuGlobe } from "react-icons/lu";
import { ModelSelector } from "./ModelSelector";
import type { ModelOption } from "./ModelSelector";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isProcessing?: boolean;
  badges?: Array<{ label: string; icon: ReactNode; prompt?: string }>;
  onRemoveBadge?: (label: string) => void;
  isCompact?: boolean;
  position?: "fixed" | "relative";
  availableModels: ModelOption[];
  selectedModelId: string | null;
  isModelLoading: boolean;
  isModelUpdating: boolean;
  onSelectModel: (modelId: string) => Promise<void>;
  webBrowsingEnabled: boolean;
  onToggleWebBrowsing: (enabled: boolean) => void;
}

export function ChatInput({
  value = "",
  onChange,
  onSend,
  onStop,
  isProcessing = false,
  badges = [],
  onRemoveBadge,
  isCompact = false,
  position = "fixed",
  availableModels,
  selectedModelId,
  isModelLoading,
  isModelUpdating,
  onSelectModel,
  webBrowsingEnabled,
  onToggleWebBrowsing,
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
    ? "absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] sm:w-[calc(100%-48px)] max-w-5xl z-40"
    : "w-full shrink-0 px-2 sm:px-3 md:px-6 pt-2 pb-4 sm:pb-6 z-40";

  return (
    <div className={containerClasses}>
      <div className={`mx-auto ${isCompact ? "max-w-xl" : "max-w-5xl"}`}>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 px-2">
            {badges.map((badge, index) => (
              <div 
                key={index} 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-panel text-xs font-medium text-[var(--text-primary)] animate-in fade-in slide-in-from-bottom-2"
              >
                <span>{badge.icon}</span>
                <span>{badge.label}</span>
                {onRemoveBadge && (
                  <button 
                    onClick={() => onRemoveBadge(badge.label)}
                    className="ml-1 p-0.5 hover:bg-[var(--glass-bg-strong)] rounded-full transition-colors"
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

        <div className="mb-2 flex items-center gap-2 px-1">
          <div className="group/web relative">
            <button
              type="button"
              onClick={() => onToggleWebBrowsing(!webBrowsingEnabled)}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-all ${
                webBrowsingEnabled
                  ? "btn-ink"
                  : "btn-glass"
              }`}
            >
              <LuGlobe className="h-4 w-4" />
              <span className="hidden sm:inline">Web</span>
            </button>
            <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-xl glass-panel px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] opacity-0 transition-opacity group-hover/web:opacity-100">
              {webBrowsingEnabled ? "Web browsing is on — click to disable" : "Web browsing is off — click to enable"}
            </span>
          </div>
          <ModelSelector
            models={availableModels}
            selectedModelId={selectedModelId}
            onSelectModel={onSelectModel}
            isLoading={isModelLoading}
            isUpdating={isModelUpdating}
            className="w-64 max-w-full"
            direction="up"
          />
        </div>

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
              className="flex min-h-[52px] w-full resize-none items-center rounded-3xl glass-panel-strong px-4 py-3 pr-12 text-sm text-[var(--text-primary)] transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--glass-border-strong)] focus:ring-4 focus:ring-[#10150a]/10 focus:outline-none md:min-h-[58px] md:px-6 md:py-4 md:pr-14 md:text-base"
            style={{ maxHeight: "168px" }}
            aria-label="Chat message input"
            />
          {isProcessing ? (
            <button
              onClick={onStop}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full btn-ink transition-all hover:scale-105 md:h-11 md:w-11"
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
                className={`absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition-all md:h-11 md:w-11 ${value.trim()
                ? "bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] hover:scale-105 hover:shadow-[var(--shadow-glass-md)]"
                : "bg-[var(--glass-bg)] text-[var(--text-muted)] cursor-not-allowed"
                }`}
                aria-label="Send message"
              >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        <p className="mt-3 text-center text-xs font-medium text-[var(--text-muted)]">
          {isProcessing ? "Click stop to cancel. Press Enter to queue your next thought." : "Press Enter to send, Shift+Enter for newline"}
        </p>
      </div>
    </div>
  );
}
