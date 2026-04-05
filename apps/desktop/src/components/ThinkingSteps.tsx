import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { ThinkingStepData } from "../lib/bindings";
import { commands } from "../lib/bindings";
import { MarkdownRenderer } from "./MarkdownRenderer";

const ASCII_BOT_FRAMES = ["[o_o]", "[O_o]", "[o_O]", "[^_^]"];

interface ThinkingStepsProps {
  steps: ThinkingStepData[];
  /** Workspace base path used to resolve relative file paths. */
  basePath?: string;
  /** Whether the parent message is still streaming. */
  isStreaming?: boolean;
}

interface ThinkingStepProps {
  step: ThinkingStepData;
  basePath?: string;
}

/** Tools whose steps reference a file that can be opened. */
const FILE_TOOLS = new Set(["read", "write", "edit", "glob", "search", "find"]);

/** Resolve a possibly-relative file path against a base directory. */
function resolveFilePath(filePath: string | undefined, basePath: string | undefined): string | null {
  if (!filePath) return null;
  // Already absolute
  if (filePath.startsWith("/")) return filePath;
  if (!basePath) return null;
  // Join base + relative (avoid double slash)
  const base = basePath.endsWith("/") ? basePath : basePath + "/";
  return base + filePath;
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
    case "task":
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6h11" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h11" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18h11" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m3 6 1.5 1.5L6.5 5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m3 12 1.5 1.5L6.5 11" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m3 18 1.5 1.5L6.5 17" />
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

function AsciiSubagentBadge() {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % ASCII_BOT_FRAMES.length);
    }, 220);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)]/12 px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--color-accent)]">
      <span className="inline-block min-w-[5ch] text-center">{ASCII_BOT_FRAMES[frameIndex]}</span>
      <span>subagent</span>
    </span>
  );
}

function TaskStepDetails({ step }: { step: ThinkingStepData }) {
  return (
    <div className="space-y-2 rounded-lg bg-[var(--surface-card)]/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
        <span>{step.tool === "subtask" ? "Delegated To" : "Subagent"}</span>
        {step.subagentType ? (
          <span className="rounded-full bg-[var(--glass-bg)] px-2 py-0.5 font-mono normal-case tracking-normal text-[var(--text-secondary)]">
            {step.subagentType}
          </span>
        ) : null}
      </div>
      {step.taskDescription ? (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">Task</p>
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--text-secondary)]">{step.taskDescription}</p>
        </div>
      ) : null}
      {step.taskPrompt ? (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">Prompt</p>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-[var(--glass-bg)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {step.taskPrompt}
          </pre>
        </div>
      ) : null}
      {step.result ? (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {step.status === "running" ? "Latest" : "Result"}
          </p>
          <div className="rounded-lg bg-[var(--glass-bg)] px-2.5 py-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
            <MarkdownRenderer content={step.result} className="text-[12px]" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ThinkingStep({ step, basePath }: ThinkingStepProps) {
  const [isExpanded, setIsExpanded] = useState(step.status === "running");
  const prevStatusRef = useRef(step.status);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = step.status;

    if (step.status === "running") {
      // Auto-expand while the tool is running.
      setIsExpanded(true);
    } else if (prev === "running") {
      // Tool just finished — keep expanded briefly so the result is visible,
      // then collapse.  The parent container will also collapse after streaming
      // ends, so this just keeps the individual step readable for a moment.
      const timer = setTimeout(() => setIsExpanded(false), 400);
      return () => clearTimeout(timer);
    }
  }, [step.status]);

  const detail = step.content?.trim() || step.result?.trim() || "";
  const hasTaskDetails = (step.tool === "task" || step.tool === "subtask")
    && Boolean(step.taskDescription || step.taskPrompt || step.result || step.subagentType);
  const canToggle = Boolean(detail || hasTaskDetails);
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

  // Determine if this step has an openable file path.
  const isFileTool = FILE_TOOLS.has(step.tool ?? "");
  const resolvedPath = resolveFilePath(step.filePath ?? step.filename, basePath);
  const canOpen = isFileTool && !!resolvedPath && !running;

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (resolvedPath) {
        commands.openInEditor(resolvedPath).catch((err) => {
          console.warn("Failed to open in editor:", err);
        });
      }
    },
    [resolvedPath],
  );

  return (
    <div className="overflow-hidden rounded-xl transition-colors duration-150 bg-transparent hover:bg-[var(--glass-bg)]/40">
      <button
        type="button"
        onClick={() => canToggle && setIsExpanded((value) => !value)}
        className="flex w-full items-start gap-2.5 px-0 py-0 text-left"
      >
        <div className={`mt-2 h-8 w-1 shrink-0 rounded-full ${accent}`} />
        <div className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2">
          <div
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
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
              {running && (step.tool === "task" || step.tool === "subtask") && (
                <AsciiSubagentBadge />
              )}
              {step.filename && (
                <span className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                  {step.filename}
                </span>
              )}
              {canOpen && (
                <button
                  type="button"
                  onClick={handleOpen}
                  title={`Open ${step.filename ?? "file"} in editor`}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] active:scale-95"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h6v6" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14 21 3" />
                  </svg>
                  Open
                </button>
              )}
               {canToggle && !running && (
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
            {detail && !isExpanded && !running && (
               <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-muted)]">
                 {detail}
               </p>
            )}
          </div>
        </div>
      </button>

      {(hasTaskDetails || detail) && isExpanded && (
        <div className="ml-[3px] border-l border-[var(--glass-border)] pl-5 pr-3 pb-3">
          {step.tool === "task" || step.tool === "subtask" ? (
            <TaskStepDetails step={step} />
          ) : (
            <div className="rounded-lg bg-[var(--surface-card)]/60 px-3 py-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              <MarkdownRenderer content={detail} className="text-[12px]" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact single-line chip shown when the step list is collapsed. */
function CompactStepChip({ step }: { step: ThinkingStepData }) {
  const errored = step.status === "error";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium ${
        errored
          ? "bg-[var(--color-danger-muted)]/60 text-[var(--color-danger)]"
          : "bg-[var(--glass-bg)] text-[var(--text-muted)]"
      }`}
    >
      <ToolGlyph tool={step.tool} running={false} complete={step.status === "complete"} errored={errored} />
      <span className="font-mono uppercase tracking-wide">{step.tool ?? "step"}</span>
      {step.filename && (
        <span className="truncate max-w-[120px] text-[var(--text-secondary)]">{step.filename}</span>
      )}
    </span>
  );
}

function ThinkingStepsComponent({ steps, basePath, isStreaming = false }: ThinkingStepsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (steps.length === 0) return null;

  const hasRunning = steps.some((step) => step.status === "running");
  const completedCount = steps.filter((step) => step.status === "complete").length;
  const errorCount = steps.filter((step) => step.status === "error").length;
  const hasErrors = errorCount > 0;

  // While tools are actively running, always show the full expanded view.
  const showExpanded = hasRunning || isExpanded;

  // Auto-expand while tools are running, auto-collapse when streaming finishes.
  useEffect(() => {
    if (hasRunning) {
      setIsExpanded(true);
    } else if (!isStreaming) {
      // Collapse once the response is complete and nothing is running.
      // Use a brief delay so the last step_complete result is visible before collapsing.
      const timer = setTimeout(() => setIsExpanded(false), 300);
      return () => clearTimeout(timer);
    }
  }, [hasRunning, isStreaming]);

  const headerDot = hasRunning
    ? "animate-pulse bg-[var(--color-accent)] shadow-[0_0_6px_var(--glow-low)]"
    : hasErrors
    ? "bg-[var(--color-danger)]"
    : "bg-[var(--color-success)]";

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-card)]/50">
      {/* Header — always visible */}
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg)]/40"
        onClick={() => !hasRunning && setIsExpanded((v) => !v)}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${headerDot}`} />
        <span className="flex-1 font-display text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          {hasRunning ? "Running" : `${completedCount} tool call${completedCount !== 1 ? "s" : ""}${hasErrors ? `, ${errorCount} error${errorCount !== 1 ? "s" : ""}` : ""}`}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
          {!hasRunning && `${completedCount}/${steps.length}`}
        </span>
        {!hasRunning && (
          <svg
            className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-200 ${showExpanded ? "rotate-0" : "-rotate-90"}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>

      {/* Collapsed: compact chip summary of all steps */}
      {!showExpanded && (
        <div className="flex flex-wrap gap-1.5 px-3.5 pb-3 pt-0.5">
          {steps.map((step) => (
            <CompactStepChip key={step.id} step={step} />
          ))}
        </div>
      )}

      {/* Expanded: full step detail list */}
      {showExpanded && (
        <div className="space-y-0.5 border-t border-[var(--glass-border)] px-1.5 py-1.5">
          {steps.map((step) => (
            <ThinkingStep key={step.id} step={step} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}

export const ThinkingSteps = memo(ThinkingStepsComponent);
