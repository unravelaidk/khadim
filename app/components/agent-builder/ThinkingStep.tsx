import { useState } from "react";
import { LuCheck, LuChevronDown, LuChevronRight, LuLoader, LuFile } from "react-icons/lu";
import { FileEditorModal } from "./FileEditorModal";

export interface ThinkingStepData {
  id: string;
  title: string;
  status: "pending" | "running" | "complete" | "error";
  content?: string;
  children?: ThinkingStepData[];
  tool?: string;
  result?: string;
  // File-related data for write_file tool
  filename?: string;
  fileContent?: string;
}

interface ThinkingStepProps {
  step: ThinkingStepData;
  depth?: number;
}

export function ThinkingStep({ step, depth = 0 }: ThinkingStepProps) {
  const [isExpanded, setIsExpanded] = useState(step.status === "running");
  const [showFileEditor, setShowFileEditor] = useState(false);

  const hasChildren = step.children && step.children.length > 0;
  const hasContent = step.content || step.result;
  const isExpandable = hasChildren || hasContent;
  
  // Check if this is a clickable file step
  const isFileStep = step.tool === "write_file" && step.filename && step.fileContent;

  return (
    <div className={`${depth > 0 ? "ml-6 border-l border-gb-border pl-4" : ""}`}>
      <div
        className={`flex items-center gap-2 py-1.5 ${
          isExpandable ? "cursor-pointer" : ""
        } ${isFileStep ? "hover:bg-gb-bg-subtle rounded-md px-1 -mx-1 cursor-pointer" : ""}`}
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
            <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <LuCheck className="w-3 h-3 text-green-600" />
            </div>
          )}
          {step.status === "running" && (
            <LuLoader className="w-4 h-4 text-gb-accent animate-spin" />
          )}
          {step.status === "pending" && (
            <div className="w-3 h-3 rounded-full border-2 border-gb-border" />
          )}
          {step.status === "error" && (
            <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 text-xs font-bold">
              !
            </div>
          )}
        </div>

        {/* Title */}
        <span className={`text-sm font-medium ${
          step.status === "complete" ? "text-gb-text-secondary" : 
          step.status === "running" ? "text-gb-text" : 
          step.status === "error" ? "text-red-500" :
          "text-gb-text-muted"
        }`}>
          {step.title}
        </span>

        {/* File indicator for clickable file steps */}
        {isFileStep && (
          <span className="ml-1 text-xs text-gb-accent flex items-center gap-1">
            <LuFile className="w-3 h-3" />
            <span className="underline underline-offset-2">View</span>
          </span>
        )}

        {/* Expand/Collapse Chevron */}
        {isExpandable && (
          <div className="ml-auto text-gb-text-muted">
            {isExpanded ? (
              <LuChevronDown className="w-4 h-4" />
            ) : (
              <LuChevronRight className="w-4 h-4" />
            )}
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-1 mb-2">
          {step.content && (
            <p className="text-sm text-gb-text-secondary ml-7 leading-relaxed">
              {step.content}
            </p>
          )}
          
          {step.result && (
            <div className="ml-7 mt-2 p-2 bg-gb-bg-subtle rounded-md border border-gb-border">
              <pre className="text-xs text-gb-text-muted font-mono whitespace-pre-wrap break-all max-h-32 overflow-auto">
                {step.result}
              </pre>
            </div>
          )}

          {/* Nested Children */}
          {hasChildren && (
            <div className="mt-2">
              {step.children!.map((child) => (
                <ThinkingStep key={child.id} step={child} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* File Editor Modal */}
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

  return (
    <div className="py-2 space-y-1">
      {steps.map((step) => (
        <ThinkingStep key={step.id} step={step} />
      ))}
    </div>
  );
}
