import { useState } from "react";
import { useEffect } from "react";
import { LuCheck, LuChevronDown, LuChevronRight, LuLoader, LuFile, LuCircleDot } from "react-icons/lu";
import { FileEditorModal } from "./FileEditorModal";
import type { ThinkingStepData } from "../../types/chat";

interface ThinkingStepProps {
  step: ThinkingStepData;
  depth?: number;
  index?: number;
}

export function ThinkingStep({ step, depth = 0, index = 0 }: ThinkingStepProps) {
  const [isExpanded, setIsExpanded] = useState(step.status === "running");
  const [showFileEditor, setShowFileEditor] = useState(false);

  useEffect(() => {
    if (step.status === "running") {
      setIsExpanded(true);
    } else if (step.status === "complete") {
      setIsExpanded(false);
    }
  }, [step.status]);

  const hasChildren = step.children && step.children.length > 0;
  const hasContent = step.content || step.result;
  const isExpandable = hasChildren || hasContent;
  const isFileStep = step.tool === "write_file" && step.filename && step.fileContent;

  return (
    <div
      className={`${depth > 0 ? "ml-4 pl-3 border-l-2 border-[var(--glass-border)]" : ""}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div
        className={`flex items-center gap-2.5 py-2 px-2.5 rounded-xl transition-all duration-200 ${
          isExpandable || isFileStep ? "cursor-pointer hover:bg-[var(--glass-bg)]" : ""
        } ${step.status === "running" ? "bg-[var(--glass-bg)]" : ""}`}
        onClick={() => {
          if (isFileStep) {
            setShowFileEditor(true);
          } else if (isExpandable) {
            setIsExpanded(!isExpanded);
          }
        }}
      >
        {/* Status Icon */}
        <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          {step.status === "complete" && (
            <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center ring-1 ring-emerald-500/30">
              <LuCheck className="w-3 h-3 text-emerald-600" strokeWidth={3} />
            </div>
          )}
          {step.status === "running" && (
            <div className="relative">
              <div className="absolute inset-0 w-5 h-5 rounded-full bg-[#10150a]/15 animate-ping" />
              <LuLoader className="relative w-5 h-5 text-[#10150a] animate-spin" />
            </div>
          )}
          {step.status === "pending" && (
            <div className="w-4 h-4 rounded-full border-2 border-[var(--glass-border-strong)] bg-[var(--glass-bg)]" />
          )}
          {step.status === "error" && (
            <div className="w-5 h-5 rounded-full bg-red-500/15 flex items-center justify-center ring-1 ring-red-500/30">
              <span className="text-red-500 text-xs font-bold">!</span>
            </div>
          )}
        </div>

        {/* Title */}
        <span className={`text-sm flex-1 transition-colors duration-200 ${
          step.status === "complete" ? "text-[var(--text-secondary)] font-medium" :
          step.status === "running" ? "text-[var(--text-primary)] font-semibold" :
          step.status === "error" ? "text-red-500 font-medium" :
          "text-[var(--text-muted)]"
        }`}>
          {step.title}
        </span>

        {/* File indicator */}
        {isFileStep && (
          <span className="text-xs flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#10150a] text-[var(--text-inverse)] font-medium">
            <LuFile className="w-3 h-3" />
            View
          </span>
        )}

        {/* Expand/Collapse */}
        {isExpandable && !isFileStep && (
          <div className={`text-[var(--text-muted)] transition-transform duration-200`}>
            {isExpanded ? <LuChevronDown className="w-4 h-4" /> : <LuChevronRight className="w-4 h-4" />}
          </div>
        )}
      </div>

      {/* Expanded Content */}
      <div className={`overflow-hidden transition-all duration-300 ease-out ${
        isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
      }`}>
        <div className="mt-1 mb-2 ml-7">
          {step.content && (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed py-1.5">
              {step.content}
            </p>
          )}

          {step.result && (
            <div className="mt-2 p-3 rounded-xl glass-card-static">
              <pre className="text-xs text-[var(--text-muted)] font-mono whitespace-pre-wrap break-all max-h-32 overflow-auto scrollbar-hide">
                {step.result}
              </pre>
            </div>
          )}

          {hasChildren && (
            <div className="mt-2 space-y-0.5">
              {step.children!.map((child, idx) => (
                <ThinkingStep key={child.id} step={child} depth={depth + 1} index={idx} />
              ))}
            </div>
          )}
        </div>
      </div>

      {isFileStep && (
        <FileEditorModal
          isOpen={showFileEditor}
          onClose={() => setShowFileEditor(false)}
          filename={step.filename!}
          content={step.fileContent!}
        />
      )}
    </div>
  );
}

interface ThinkingStepsProps {
  steps: ThinkingStepData[];
}

export function ThinkingSteps({ steps }: ThinkingStepsProps) {
  if (steps.length === 0) return null;

  const completedCount = steps.filter((s) => s.status === "complete").length;
  const isAllComplete = completedCount === steps.length;
  const hasRunning = steps.some((s) => s.status === "running");

  return (
    <div className="rounded-2xl glass-card-static overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[var(--glass-border)]">
        <div className={`w-2 h-2 rounded-full ${
          hasRunning ? "bg-[#10150a] animate-pulse" :
          isAllComplete ? "bg-emerald-500" :
          "bg-[var(--text-muted)]"
        }`} />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {hasRunning ? "Thinking" : isAllComplete ? "Completed" : "Reasoning"}
        </span>
        <span className="ml-auto text-xs text-[var(--text-muted)] font-medium tabular-nums">
          {completedCount}/{steps.length}
        </span>
      </div>

      {/* Steps */}
      <div className="p-2 space-y-0.5">
        {steps.map((step, index) => (
          <ThinkingStep key={step.id} step={step} index={index} />
        ))}
      </div>
    </div>
  );
}
