import { useCallback, useEffect, useRef, useState } from "react";
import type { PendingQuestion, QuestionItem } from "../lib/bindings";

interface Props {
  question: PendingQuestion;
  onAnswer: (answers: string[][]) => void;
  onDismiss: () => void;
}

/**
 * Renders a single question card — header, selectable options, optional custom text input.
 * Returns the selected labels (or custom text) for that question.
 */
function QuestionCard({
  item,
  value,
  onChange,
}: {
  item: QuestionItem;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [customText, setCustomText] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);
  const allowCustom = item.custom !== false; // default true

  const toggleOption = useCallback(
    (label: string) => {
      if (item.multiple) {
        const next = value.includes(label)
          ? value.filter((v) => v !== label)
          : [...value, label];
        onChange(next);
      } else {
        onChange(value.includes(label) ? [] : [label]);
        setShowCustom(false);
      }
    },
    [item.multiple, value, onChange],
  );

  const handleCustomToggle = useCallback(() => {
    if (showCustom) {
      setShowCustom(false);
      setCustomText("");
      // Remove any custom entry
      onChange(value.filter((v) => item.options.some((o) => o.label === v)));
    } else {
      if (!item.multiple) onChange([]);
      setShowCustom(true);
      requestAnimationFrame(() => customInputRef.current?.focus());
    }
  }, [showCustom, item.multiple, item.options, value, onChange]);

  // Sync custom text into the value array
  useEffect(() => {
    if (!showCustom) return;
    const existing = value.filter((v) => item.options.some((o) => o.label === v));
    if (customText.trim()) {
      onChange([...existing, customText.trim()]);
    } else {
      onChange(existing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customText]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {item.header}
        </p>
        <p className="mt-1 text-sm font-medium text-[var(--text-primary)] leading-snug">
          {item.question}
        </p>
        {item.multiple && (
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            Select one or more options
          </p>
        )}
      </div>

      {/* Options */}
      <div className="flex flex-wrap gap-2">
        {item.options.map((opt) => {
          const selected = value.includes(opt.label);
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => toggleOption(opt.label)}
              className={`group relative rounded-2xl border px-3.5 py-2 text-left transition-all duration-150 ${
                selected
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 shadow-[0_0_0_1px_var(--color-accent)]"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[var(--glass-border-strong)] hover:bg-[var(--glass-bg-strong)]"
              }`}
            >
              <span
                className={`block text-[12px] font-semibold leading-tight ${
                  selected ? "text-[var(--color-accent)]" : "text-[var(--text-primary)]"
                }`}
              >
                {opt.label}
              </span>
              {opt.description && (
                <span className="mt-0.5 block text-[10px] leading-snug text-[var(--text-muted)]">
                  {opt.description}
                </span>
              )}
              {/* Checkmark */}
              {selected && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-ink)]">
                  <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}

        {/* Custom / free text toggle */}
        {allowCustom && (
          <button
            type="button"
            onClick={handleCustomToggle}
            className={`rounded-2xl border px-3.5 py-2 text-left transition-all duration-150 ${
              showCustom
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                : "border-dashed border-[var(--glass-border)] bg-transparent hover:border-[var(--glass-border-strong)] hover:bg-[var(--glass-bg)]"
            }`}
          >
            <span className={`block text-[12px] font-semibold leading-tight ${showCustom ? "text-[var(--color-accent)]" : "text-[var(--text-muted)]"}`}>
              Type your own
            </span>
          </button>
        )}
      </div>

      {/* Custom text input */}
      {showCustom && (
        <input
          ref={customInputRef}
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          className="w-full rounded-2xl glass-input px-3 py-2.5 text-sm outline-none"
          placeholder="Type your answer..."
        />
      )}
    </div>
  );
}

/**
 * Full-screen overlay that presents one or more questions from the agent.
 * Answers are collected per-question and preserved as arrays for the backend.
 */
export function QuestionOverlay({ question, onAnswer, onDismiss }: Props) {
  const [answers, setAnswers] = useState<string[][]>(() =>
    question.questions.map(() => []),
  );
  const backdropRef = useRef<HTMLDivElement>(null);

  // Escape to dismiss
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDismiss]);

  const hasAnswer = answers.some((a) => a.length > 0);

  const handleSubmit = useCallback(() => {
    onAnswer(answers);
  }, [answers, onAnswer]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === backdropRef.current) onDismiss();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--surface-ink-25)] backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-[520px] max-h-[80vh] mx-4 glass-panel-strong rounded-[var(--radius-xl)] animate-in zoom-in slide-in-from-bottom-4 duration-300 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Agent question"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </span>
            <div>
              <h2 className="font-display text-base font-medium text-[var(--text-primary)]">
                Agent needs your input
              </h2>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                Answer to continue
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="h-8 w-8 flex items-center justify-center rounded-2xl text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="h-px bg-[var(--glass-border)] mx-6 shrink-0" />

        {/* Questions list */}
        <div className="overflow-y-auto px-6 py-5 space-y-6 scrollbar-thin">
          {question.questions.map((item, idx) => (
            <QuestionCard
              key={item.header}
              item={item}
              value={answers[idx]}
              onChange={(next) => {
                setAnswers((prev) => {
                  const copy = [...prev];
                  copy[idx] = next;
                  return copy;
                });
              }}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="h-px bg-[var(--glass-border)] mx-6 shrink-0" />
        <div className="flex items-center justify-end gap-2 px-6 py-4 shrink-0">
          <button
            onClick={onDismiss}
            className="h-9 px-4 rounded-2xl btn-glass text-[12px] font-semibold"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={!hasAnswer}
            className="h-9 px-5 rounded-2xl btn-ink text-[12px] font-semibold disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
