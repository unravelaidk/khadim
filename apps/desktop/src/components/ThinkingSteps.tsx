import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { ThinkingStepData } from "../lib/bindings";
import { commands } from "../lib/bindings";
import { MarkdownRenderer } from "./MarkdownRenderer";

/** Guess a syntax-highlight language from a filename extension. */
function guessLanguage(filename: string | undefined): string {
  if (!filename) return "text";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rb: "ruby", rs: "rust", go: "go",
    java: "java", kt: "kotlin", swift: "swift", c: "c", cpp: "cpp", h: "c",
    cs: "csharp", css: "css", scss: "scss", html: "html", xml: "xml",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    md: "markdown", sql: "sql", sh: "bash", bash: "bash", zsh: "bash",
    dockerfile: "dockerfile", makefile: "makefile",
    vue: "html", svelte: "html", astro: "html",
  };
  return map[ext] ?? "text";
}

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
      <i className="ri-loader-4-line text-[14px] leading-none dot-spinner" />
    );
  }

  if (errored) {
    return (
      <i className="ri-error-warning-line text-[14px] leading-none" />
    );
  }

  if (complete) {
    return (
      <i className="ri-check-line text-[14px] leading-none" />
    );
  }

  switch (tool) {
    case "read":
      return (
        <i className="ri-eye-line text-[14px] leading-none" />
      );
    case "write":
      return (
        <i className="ri-code-line text-[14px] leading-none" />
      );
    case "bash":
    case "exec":
      return (
        <i className="ri-arrow-left-s-line text-[14px] leading-none" />
      );
    case "task":
      return (
        <i className="ri-menu-line text-[14px] leading-none" />
      );
    default:
      return (
        <i className="ri-add-circle-line text-[14px] leading-none" />
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

/** Displays the full file content written/edited by a tool step. */
function FileContentBlock({
  fileContent,
  filename,
  filePath,
  result,
  running,
}: {
  fileContent: string;
  filename?: string;
  filePath?: string;
  result?: string;
  running: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const lang = guessLanguage(filename);
  const lineCount = fileContent.split("\n").length;
  const displayPath = filePath ?? filename;

  return (
    <div className="space-y-2">
      {/* File header */}
      <div className="flex items-center justify-between gap-2 rounded-t-lg bg-[var(--surface-ink-4)] px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <i className="ri-file-line text-[14px] leading-none text-[var(--text-muted)]" />
          {displayPath && (
            <span className="truncate font-mono text-[11px] text-[var(--text-secondary)]" title={displayPath}>
              {displayPath}
            </span>
          )}
          <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
            {lineCount} line{lineCount !== 1 ? "s" : ""}
          </span>
          {running && (
            <span className="shrink-0 text-[10px] font-medium text-[var(--color-accent)] animate-pulse">writing…</span>
          )}
        </div>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(fileContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          title={copied ? "Copied!" : "Copy file content"}
        >
          {copied ? (
            <i className="ri-check-line text-[14px] leading-none text-[var(--color-success)]" />
          ) : (
            <i className="ri-file-copy-line text-[14px] leading-none" />
          )}
        </button>
      </div>

      {/* Full file content as a markdown code block for syntax highlighting */}
      <div className="-mt-2 rounded-b-lg overflow-hidden">
        <MarkdownRenderer
          content={`\`\`\`${lang}\n${fileContent}\n\`\`\``}
          className="text-[12px] [&_pre]:!mt-0 [&_pre]:!rounded-t-none [&>div>div]:!my-0"
        />
      </div>

      {/* Tool result summary */}
      {result && (
        <p className="text-[11px] text-[var(--text-muted)] px-1">{result}</p>
      )}
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
  const hasFileContent = Boolean(step.fileContent);
  const hasTaskDetails = (step.tool === "task" || step.tool === "subtask")
    && Boolean(step.taskDescription || step.taskPrompt || step.result || step.subagentType);
  const canToggle = Boolean(detail || hasTaskDetails || hasFileContent);
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
                  <i className="ri-file-edit-line text-[12px] leading-none" />
                  Open
                </button>
              )}
               {canToggle && !running && (
                 <span className="ml-auto text-[var(--text-muted)]">
                   <i className={`${isExpanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-[14px] leading-none`} />
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

      {(hasTaskDetails || detail || hasFileContent) && isExpanded && (
        <div className="ml-[3px] border-l border-[var(--glass-border)] pl-5 pr-3 pb-3">
          {step.tool === "task" || step.tool === "subtask" ? (
            <TaskStepDetails step={step} />
          ) : hasFileContent ? (
            <FileContentBlock
              fileContent={step.fileContent!}
              filename={step.filename}
              filePath={step.filePath}
              result={step.result}
              running={running}
            />
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
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-1 text-[10px] font-medium ${
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
    <div className="overflow-hidden depth-card-sm">
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
          <i className={`${isExpanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-[14px] leading-none`} />
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
