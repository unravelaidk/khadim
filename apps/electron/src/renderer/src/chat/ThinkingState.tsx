"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ToolCallActivity } from "../../../shared/types";
import { AgentThinkingOrb } from "./AgentThinkingOrb";

type ThinkingVariant = "Steps" | "Reasoning" | "Search" | "Coding";

type Row = {
  primary: string;
  secondary?: string;
  mono?: boolean;
  add?: number;
  del?: number;
  href?: string;
  status?: ToolCallActivity["status"];
};

const variants: Record<ThinkingVariant, { active: string; done: string; rows: Row[]; query?: string }> = {
  Steps: {
    active: "Thinking",
    done: "Finished thinking",
    rows: [],
  },
  Reasoning: {
    active: "Thinking",
    done: "Finished thinking",
    rows: [],
  },
  Search: {
    active: "Searching the web",
    done: "Searched the web",
    rows: [],
  },
  Coding: {
    active: "Running tools",
    done: "Finished running tools",
    rows: [],
  },
};

const searchTools = new Set(["web_search", "web_fetch", "webfetch"]);
const codingTools = new Set(["bash", "shell", "edit", "write", "read", "grep", "glob", "artifact_edit"]);

function inferredVariant(activities: ToolCallActivity[]): ThinkingVariant {
  if (activities.some((activity) => searchTools.has(activity.tool))) return "Search";
  if (activities.some((activity) => codingTools.has(activity.tool))) return "Coding";
  return activities.length > 0 ? "Steps" : "Reasoning";
}

function activityTitle(activity: ToolCallActivity): string {
  const path = typeof activity.metadata?.path === "string" ? activity.metadata.path : null;
  const filename = path?.split(/[\\/]/).filter(Boolean).at(-1);
  if (activity.tool === "bash" || activity.tool === "shell") return activity.status === "running" ? "Running command" : "Ran command";
  if (activity.tool === "edit" || activity.tool === "write") return `${activity.status === "running" ? "Editing" : "Edited"} ${filename ?? "file"}`;
  if (activity.tool === "read") return `${activity.status === "running" ? "Reading" : "Read"} ${filename ?? "file"}`;
  if (activity.tool === "grep" || activity.tool === "glob" || activity.tool === "web_search") return activity.status === "running" ? "Searching" : "Search complete";
  if (activity.tool === "web_fetch" || activity.tool === "webfetch") return activity.status === "running" ? "Reading source" : "Source read";
  return activity.title || activity.tool.replaceAll("_", " ");
}

function activityRows(activities: ToolCallActivity[]): Row[] {
  return activities.map((activity) => {
    const path = typeof activity.metadata?.path === "string" ? activity.metadata.path : undefined;
    const url = typeof activity.metadata?.url === "string" ? activity.metadata.url : undefined;
    const additions = typeof activity.metadata?.additions === "number" ? activity.metadata.additions : undefined;
    const deletions = typeof activity.metadata?.deletions === "number" ? activity.metadata.deletions : undefined;
    return {
      primary: activityTitle(activity),
      secondary: path ?? (url ? (() => {
        try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
      })() : undefined),
      mono: Boolean(path) || codingTools.has(activity.tool),
      add: additions,
      del: deletions,
      href: url,
      status: activity.status,
    };
  });
}

function searchQuery(activities: ToolCallActivity[]): string | undefined {
  const search = activities.find((activity) => activity.tool === "web_search");
  if (!search) return undefined;
  if (typeof search.metadata?.query === "string") return search.metadata.query;
  if (!search.input) return undefined;
  try {
    const input = JSON.parse(search.input) as Record<string, unknown>;
    const query = input.query ?? input.q;
    return typeof query === "string" ? query : undefined;
  } catch {
    return search.input.length <= 120 ? search.input : undefined;
  }
}

function SourceDot({ index }: { index: number }): React.JSX.Element {
  return (
    <span className={`thinking-source-dot tone-${index % 3}`}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    </span>
  );
}

export default function ThinkingState({
  variant,
  activities = [],
  working = true,
}: {
  variant?: ThinkingVariant;
  activities?: ToolCallActivity[];
  working?: boolean;
}): React.JSX.Element {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const effectiveVariant = variant ?? (activities.length > 0 ? inferredVariant(activities) : "Steps");
  const definition = variants[effectiveVariant];
  const liveRows = activityRows(activities);
  const rows = liveRows;
  const runningActivity = activities.some((activity) => activity.status === "running");
  const hasTrace = rows.length > 0;
  const autoExpanded = hasTrace && runningActivity;
  const expanded = manualExpanded ?? autoExpanded;
  const visibleCount = rows.length;
  const query = effectiveVariant === "Search" ? searchQuery(activities) : undefined;
  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);

  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight);
  }, [visibleCount, expanded, effectiveVariant]);

  const headerContent = (
    <>
      <AgentThinkingOrb activities={activities} decorative />
      <span className={`thinking-state-label${working ? " is-active" : ""}`}>
        {working ? definition.active : definition.done}
      </span>
      {hasTrace && (
        <svg className="thinking-state-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      )}
    </>
  );

  return (
    <div className={`thinking-state is-${effectiveVariant.toLowerCase()}`}>
      {hasTrace ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${working ? definition.active : definition.done}. ${expanded ? "Collapse" : "Expand"} activity`}
          onClick={() => setManualExpanded((current) => !(current ?? autoExpanded))}
          className="thinking-state-header"
        >
          {headerContent}
        </button>
      ) : (
        <div className="thinking-state-header is-static" role={working ? "status" : undefined}>
          {headerContent}
        </div>
      )}

      {hasTrace && <div className="thinking-state-expand" aria-hidden={!expanded} inert={!expanded} style={{ gridTemplateRows: expanded ? "1fr" : "0fr", opacity: expanded ? 1 : 0 }}>
        <div className="thinking-state-overflow">
          <div className="thinking-state-trace">
            <span className="thinking-state-line" aria-hidden="true" style={{ height: lineHeight ? Math.max(0, lineHeight - 2) : 0 }} />
            <div ref={traceRef} className="thinking-state-rows">
              {query && (
                <div className="thinking-state-query">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <span>{query}</span>
                </div>
              )}
              {rows.slice(0, visibleCount).map((row, index) => {
                const rowKey = `${row.primary}-${row.secondary ?? ""}-${index}`;
                const complete = row.status ? row.status !== "running" : index < visibleCount - 1 || !working;
                const content = (
                  <>
                    {effectiveVariant === "Search" && <SourceDot index={index} />}
                    {effectiveVariant === "Steps" && (complete ? (
                      <svg className="thinking-step-check" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : <span className="thinking-step-spinner" aria-hidden="true" />)}
                    <span className={`thinking-row-primary${effectiveVariant === "Reasoning" ? " is-reasoning" : ""}`}>{row.primary}</span>
                    {row.secondary && <span className={`thinking-row-secondary${row.mono ? " is-mono" : ""}`}>{row.secondary}</span>}
                    {row.add !== undefined && (
                      <span className="thinking-row-diff"><span>+{row.add}</span> <span>−{row.del ?? 0}</span></span>
                    )}
                  </>
                );
                const style = { animationDelay: `${index * 120}ms` };

                if (effectiveVariant === "Search" && row.href) {
                  return (
                    <a className="thinking-state-row is-link" href={row.href} target="_blank" rel="noreferrer" key={rowKey} style={style}>
                      {content}
                    </a>
                  );
                }

                if (effectiveVariant === "Coding") {
                  const selected = selectedTool === rowKey;
                  return (
                    <button type="button" aria-pressed={selected} onClick={() => setSelectedTool(selected ? null : rowKey)} className={`thinking-state-row is-tool${selected ? " is-selected" : ""}`} key={rowKey} style={style}>
                      {content}
                    </button>
                  );
                }

                return <div className="thinking-state-row" key={rowKey} style={style}>{content}</div>;
              })}
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}
