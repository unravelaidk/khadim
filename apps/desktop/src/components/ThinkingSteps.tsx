import { memo, useEffect, useState } from "react";
import type { ThinkingStepData } from "../lib/bindings";

interface ThinkingStepsProps {
  steps: ThinkingStepData[];
}

interface ThinkingStepProps {
  step: ThinkingStepData;
}

function ToolGlyph({ tool, running, complete, errored }: { tool?: string; running: boolean; complete: boolean; errored: boolean }) {
  if (running) {
    return (
      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4m0 10v4m9-9h-4M7 12H3m15.364 6.364-2.828-2.828M8.464 8.464 5.636 5.636m12.728 0-2.828 2.828M8.464 15.536l-2.828 2.828" />
      </svg>
    );
  }

  if (errored) {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </svg>
    );
  }

  if (complete) {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" />
      </svg>
    );
  }

  switch (tool) {
    case "read":
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "write":
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "bash":
    case "exec":
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4 17 6-6-6-6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19h8" />
        </svg>
      );
    default:
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M2 12h20" />
        </svg>
      );
  }
}

function ThinkingStep({ step }: ThinkingStepProps) {
  const [isExpanded, setIsExpanded] = useState(step.status === "running");

  useEffect(() => {
    setIsExpanded(step.status === "running");
  }, [step.status]);

  const detail = step.content?.trim() || step.result?.trim() || "";
  const running = step.status === "running";
  const complete = step.status === "complete";
  const errored = step.status === "error";
  const accent = running
    ? "bg-[var(--color-accent)]"
    : errored
      ? "bg-[var(--color-danger)]"
      : complete
        ? "bg-[var(--color-success)]"
        : "bg-[var(--glass-border)]";

  return (
    <div className="overflow-hidden rounded-lg transition-colors duration-150 bg-transparent hover:bg-[var(--glass-bg)]/40">
      <button
        type="button"
        onClick={() => detail && setIsExpanded((value) => !value)}
        className="flex w-full items-start gap-2.5 px-0 py-0 text-left"
      >
        <div className={`mt-2 h-8 w-1 shrink-0 rounded-full ${accent}`} />
        <div className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2">
          <div
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
              running
                  ? "bg-[var(--color-accent)]/80 text-[var(--color-accent-ink)]"
                : errored
                  ? "bg-[var(--color-danger-muted)] text-[var(--color-danger)]"
                  : "bg-[var(--glass-bg)] text-[var(--text-muted)]"
            }`}
          >
            <ToolGlyph tool={step.tool} running={running} complete={complete} errored={errored} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                {step.tool ?? "step"}
              </span>
              {step.filename && (
                <span className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                  {step.filename}
                </span>
              )}
              {detail && !running && (
                <span className="ml-auto text-[var(--text-muted)]">
                  <svg className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : "rotate-0"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              )}
            </div>
            <p className={`mt-0.5 text-[13px] leading-snug ${running ? "font-medium text-[var(--text-primary)]" : errored ? "text-[var(--color-danger)]" : "text-[var(--text-secondary)]"}`}>
              {step.title}
            </p>
            {detail && (!isExpanded || running) && (
              <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-muted)]">
                {detail}
              </p>
            )}
          </div>
        </div>
      </button>

      {detail && isExpanded && !running && (
        <div className="ml-[3px] border-l border-[var(--glass-border)] pl-5 pr-3 pb-3">
          <div className="rounded-md bg-[var(--surface-card)]/60 px-3 py-2">
            <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {detail}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function ThinkingStepsComponent({ steps }: ThinkingStepsProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (steps.length === 0) return null;

  const hasRunning = steps.some((step) => step.status === "running");
  const completedCount = steps.filter((step) => step.status === "complete").length;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--surface-card)]/50">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg)]/40"
        onClick={() => !hasRunning && setIsCollapsed((value) => !value)}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${hasRunning ? "animate-pulse bg-[var(--color-accent)] shadow-[0_0_6px_var(--glow-low)]" : "bg-[var(--color-success)]"}`} />
        <span className="flex-1 font-display text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          {hasRunning ? "Running" : "Work log"}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
          {completedCount}/{steps.length}
        </span>
        {!hasRunning && (
          <svg className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform ${isCollapsed ? "-rotate-90" : "rotate-0"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>

      {!isCollapsed && (
        <div className="space-y-0.5 border-t border-[var(--glass-border)] px-1.5 py-1.5">
          {steps.map((step) => (
            <ThinkingStep key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

export const ThinkingSteps = memo(ThinkingStepsComponent);
