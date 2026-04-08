import { useEffect, useState } from "react";
import type { IconType } from "react-icons";
import {
  LuBrain,
  LuCheck,
  LuChevronDown,
  LuChevronRight,
  LuEye,
  LuFile,
  LuFolderOpen,
  LuGlobe,
  LuLoader,
  LuSearch,
  LuBot,
  LuTerminal,
  LuCircleAlert,
} from "react-icons/lu";
import type { ThinkingStepData } from "../../types/chat";
import { cn } from "../../lib/utils";

/* ── Single step row ──────────────────────────────────────────────── */

interface ThinkingStepProps {
  step: ThinkingStepData;
  depth?: number;
  index?: number;
  onOpenFile?: (info: { filename: string; content: string }) => void;
}

export function ThinkingStep({ step, depth = 0, index = 0, onOpenFile }: ThinkingStepProps) {
  const [isExpanded, setIsExpanded] = useState(step.status === "running");

  useEffect(() => {
    if (step.status === "running") setIsExpanded(true);
    else if (step.status === "complete") setIsExpanded(false);
  }, [step.status]);

  const hasChildren = step.children && step.children.length > 0;
  const hasContent = Boolean(step.content || step.result);
  const isExpandable = Boolean(hasChildren || hasContent);
  const isFileStep = step.tool === "write_file" && step.filename && step.fileContent;
  const toolMeta = getToolMeta(step.tool);
  const detailText = step.content?.trim() || step.result?.trim() || "";
  const fileLabel = step.filename ? basename(step.filename) : null;
  const canToggle = isExpandable && !isFileStep;

  const accentBar =
    step.status === "running"
      ? "bg-[var(--color-accent)]"
      : step.status === "error"
        ? "bg-red-500"
        : step.status === "complete"
          ? "bg-[var(--text-muted)]/40"
          : "bg-[var(--glass-border)]";

  return (
    <div
      className={cn("relative", depth > 0 && "ml-5")}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Row */}
      <div
        className={cn(
          "group relative flex items-stretch overflow-hidden rounded-lg transition-colors duration-150",
          step.status === "running"
            ? "bg-[var(--color-accent-subtle)]/50"
            : "bg-transparent hover:bg-[var(--glass-bg)]/40",
          (canToggle || isFileStep) && "cursor-pointer",
        )}
        onClick={() => {
          if (isFileStep) onOpenFile?.({ filename: step.filename!, content: step.fileContent! });
          else if (canToggle) setIsExpanded(!isExpanded);
        }}
      >
        {/* Left accent bar */}
        <div className={cn("w-[3px] shrink-0 rounded-full", accentBar)} />

        <div className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2">
          {/* Icon */}
          <div className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            step.status === "running"
              ? "text-[var(--color-accent-ink)] bg-[var(--color-accent)]/80"
              : step.status === "error"
                ? "text-red-500 bg-red-500/10"
                : "text-[var(--text-muted)] bg-[var(--glass-bg)]",
          )}>
            {step.status === "running" ? (
              <LuLoader className="h-3.5 w-3.5 animate-spin" />
            ) : step.status === "error" ? (
              <LuCircleAlert className="h-3.5 w-3.5" />
            ) : (
              <toolMeta.Icon className="h-3.5 w-3.5" />
            )}
          </div>

          {/* Body */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
                {toolMeta.label}
              </span>
              {fileLabel && (
                <span className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                  {fileLabel}
                </span>
              )}
              {isFileStep && (
                <span className="ml-auto whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent-ink)] bg-[var(--color-accent)]/70 px-1.5 py-0.5 rounded">
                  open
                </span>
              )}
              {canToggle && (
                <span className="ml-auto text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                  {isExpanded ? <LuChevronDown className="h-3.5 w-3.5" /> : <LuChevronRight className="h-3.5 w-3.5" />}
                </span>
              )}
            </div>

            <p className={cn(
              "mt-0.5 text-[13px] leading-snug",
              step.status === "running"
                ? "text-[var(--text-primary)] font-medium"
                : step.status === "error"
                  ? "text-red-400"
                  : "text-[var(--text-secondary)]",
            )}>
              {step.title}
            </p>

            {detailText && !isExpanded && (
              <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                {detailText}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      <div className={cn(
        "overflow-hidden transition-all duration-200 ease-out",
        isExpanded ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0",
      )}>
        <div className="ml-[3px] border-l border-[var(--glass-border)] pl-5 pt-1 pb-1 space-y-1.5">
          {step.content && (
            <div className="rounded-md bg-[var(--surface-card)]/60 px-3 py-2">
              <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{step.content}</p>
            </div>
          )}

          {step.result && (
            <div className="rounded-md bg-[var(--surface-card)]/60 px-3 py-2">
              <span className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                output
              </span>
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] scrollbar-hide">
                {step.result}
              </pre>
            </div>
          )}

          {hasChildren && (
            <div className="space-y-0.5">
              {step.children!.map((child, idx) => (
                <ThinkingStep key={child.id} step={child} depth={depth + 1} index={idx} onOpenFile={onOpenFile} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Steps container ──────────────────────────────────────────────── */

interface ThinkingStepsProps {
  steps: ThinkingStepData[];
  onOpenFile?: (info: { filename: string; content: string }) => void;
}

export function ThinkingSteps({ steps, onOpenFile }: ThinkingStepsProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (steps.length === 0) return null;

  const completedCount = steps.filter((s) => s.status === "complete").length;
  const isAllComplete = completedCount === steps.length;
  const hasRunning = steps.some((s) => s.status === "running");
  const errorCount = steps.filter((s) => s.status === "error").length;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--surface-card)]/50">
      {/* Header bar */}
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg)]/40"
        onClick={() => !hasRunning && setIsCollapsed(!isCollapsed)}
      >
        {/* Status dot */}
        <span className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          hasRunning
            ? "bg-[var(--color-accent)] shadow-[0_0_6px_var(--glow-low)] animate-pulse"
            : errorCount > 0
              ? "bg-red-500"
              : isAllComplete
                ? "bg-emerald-500"
                : "bg-[var(--text-muted)]",
        )} />

        <span className="flex-1 font-display text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          {hasRunning ? "Running" : isAllComplete ? "Done" : "Work log"}
        </span>

        {/* Count */}
        <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
          {completedCount}/{steps.length}
        </span>

        {!hasRunning && (
          <span className="text-[var(--text-muted)]">
            {isCollapsed ? <LuChevronRight className="h-3.5 w-3.5" /> : <LuChevronDown className="h-3.5 w-3.5" />}
          </span>
        )}
      </button>

      {/* Steps list */}
      <div className={cn(
        "transition-all duration-200 ease-out",
        isCollapsed ? "max-h-0 overflow-hidden" : "max-h-[2400px] opacity-100",
      )}>
        <div className="border-t border-[var(--glass-border)] px-1.5 py-1.5 space-y-0.5">
          {steps.map((step, index) => (
            <ThinkingStep key={step.id} step={step} index={index} onOpenFile={onOpenFile} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function getToolMeta(tool?: string): { label: string; Icon: IconType } {
  switch (tool) {
    case "read_file":
      return { label: "read", Icon: LuEye };
    case "write_file":
      return { label: "write", Icon: LuFile };
    case "list_files":
      return { label: "ls", Icon: LuFolderOpen };
    case "web_search":
      return { label: "search", Icon: LuSearch };
    case "create_plan":
      return { label: "plan", Icon: LuBrain };
    case "expose_preview":
      return { label: "preview", Icon: LuGlobe };
    case "delegate_to_agent":
      return { label: "delegate", Icon: LuBot };
    default:
      return { label: "exec", Icon: LuTerminal };
  }
}

function basename(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || path;
}
