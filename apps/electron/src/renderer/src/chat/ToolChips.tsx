"use client";

import { useState } from "react";
import type { ToolCallActivity } from "../../../shared/types";
import { AgentThinkingOrb } from "./AgentThinkingOrb";

const icons: Record<string, React.ReactNode> = {
  think: <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />,
  write: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></g>,
  run: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l6-5-6-5M12 19h8" /></g>,
  read: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></g>,
};

function iconFor(activity: ToolCallActivity): string {
  if (activity.tool === "bash" || activity.tool === "shell") return "run";
  if (activity.tool === "edit" || activity.tool === "write" || activity.tool === "artifact_edit") return "write";
  if (activity.tool === "read" || activity.tool === "artifact_read" || activity.tool === "web_fetch" || activity.tool === "webfetch") return "read";
  return "think";
}

function rowLabel(activity: ToolCallActivity): string {
  if (activity.status === "error") {
    if (activity.tool === "bash" || activity.tool === "shell") return "Command failed";
    if (activity.tool === "edit" || activity.tool === "write" || activity.tool === "artifact_edit") return "Edit failed";
    if (activity.tool === "read" || activity.tool === "artifact_read" || activity.tool === "web_fetch" || activity.tool === "webfetch") return "Read failed";
    if (activity.tool === "web_search") return "Search failed";
    return "Tool failed";
  }
  if (activity.tool === "bash" || activity.tool === "shell") return activity.status === "running" ? "Running" : "Ran command";
  if (activity.tool === "edit" || activity.tool === "write") return activity.status === "running" ? "Writing" : "Wrote file";
  if (activity.tool === "artifact_edit") return activity.title || (activity.status === "running" ? "Updating artifact" : "Updated artifact");
  if (activity.tool === "artifact_read") return activity.status === "running" ? "Reading artifact" : "Read artifact";
  if (activity.tool === "read") return activity.status === "running" ? "Reading" : "Read file";
  if (activity.tool === "web_search") return activity.status === "running" ? "Searching" : "Searched web";
  if (activity.tool === "web_fetch" || activity.tool === "webfetch") return activity.status === "running" ? "Reading source" : "Read source";
  return activity.status === "running" ? "Using tool" : "Used tool";
}

function rowChip(activity: ToolCallActivity): { text: string; mono: boolean } {
  const path = typeof activity.metadata?.path === "string" ? activity.metadata.path : null;
  if (path) return { text: path.split(/[\\/]/).filter(Boolean).at(-1) ?? path, mono: true };
  const url = typeof activity.metadata?.url === "string" ? activity.metadata.url : null;
  if (url) {
    try { return { text: new URL(url).hostname.replace(/^www\./, ""), mono: false }; } catch { return { text: url, mono: false }; }
  }
  const detail = activity.status === "running" ? activity.input : activity.result ?? activity.input;
  if (detail) {
    const firstLine = detail.trim().split("\n", 1)[0];
    if (/^(?:\{|\[)/.test(firstLine)) return { text: activity.title || activity.tool.replaceAll("_", " "), mono: false };
    return { text: firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine, mono: activity.tool === "bash" || activity.tool === "shell" };
  }
  return { text: activity.title || activity.tool.replaceAll("_", " "), mono: false };
}

function detailFor(activity: ToolCallActivity): string {
  const detail = activity.status === "running" ? activity.input : activity.result ?? activity.input;
  if (!detail) return activity.status === "error" ? "The tool failed without additional output." : "No additional output was returned.";
  try { return JSON.stringify(JSON.parse(detail), null, 2); } catch { return detail; }
}

type FileDiff = { file: string; add?: number; del?: number; changes?: number };

function fileDiffs(activities: ToolCallActivity[]): FileDiff[] {
  const files = new Map<string, FileDiff>();
  for (const activity of activities) {
    if (activity.status === "error") continue;
    if (activity.tool !== "edit" && activity.tool !== "write" && activity.tool !== "artifact_edit") continue;
    const rawPath = typeof activity.metadata?.path === "string"
      ? activity.metadata.path
      : typeof activity.metadata?.artifactTitle === "string"
        ? activity.metadata.artifactTitle
        : null;
    if (!rawPath) continue;
    const file = rawPath.split(/[\\/]/).filter(Boolean).at(-1) ?? rawPath;
    const previous = files.get(rawPath) ?? { file };
    const add = typeof activity.metadata?.additions === "number" ? activity.metadata.additions : undefined;
    const del = typeof activity.metadata?.deletions === "number" ? activity.metadata.deletions : undefined;
    const changes = typeof activity.metadata?.changeCount === "number" ? activity.metadata.changeCount : undefined;
    files.set(rawPath, {
      file,
      add: add === undefined ? previous.add : (previous.add ?? 0) + add,
      del: del === undefined ? previous.del : (previous.del ?? 0) + del,
      changes: changes === undefined ? previous.changes : (previous.changes ?? 0) + changes,
    });
  }
  return [...files.values()];
}

export function ToolChips({ activities }: { activities: ToolCallActivity[] }): React.JSX.Element {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const diffs = fileDiffs(activities);
  const runningCount = activities.filter((activity) => activity.status === "running").length;
  const errorCount = activities.filter((activity) => activity.status === "error").length;
  const autoOpen = runningCount > 0 || errorCount > 0;
  const open = manualOpen ?? autoOpen;
  const summary = runningCount > 0
    ? `${activities.length} tool ${activities.length === 1 ? "call" : "calls"} · ${runningCount} running`
    : errorCount > 0
      ? `${activities.length} tool ${activities.length === 1 ? "call" : "calls"} · ${errorCount} failed`
      : `${activities.length} tool ${activities.length === 1 ? "call" : "calls"}`;

  function toggleRow(id: string): void {
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="tool-chips" aria-label="Tool activity">
      <button type="button" aria-expanded={open} onClick={() => setManualOpen((current) => !(current ?? autoOpen))} className={`tool-chips-header${runningCount > 0 ? " is-running" : errorCount > 0 ? " is-error" : ""}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}><path d="M6 9l6 6 6-6" /></svg>
        {runningCount > 0 && <AgentThinkingOrb activities={activities} decorative />}
        <span>{summary}</span>
      </button>

      <div className="tool-chips-expand" aria-hidden={!open} inert={!open} style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}>
        <div className="tool-chips-overflow">
          <div className="tool-chip-rows">
            {activities.map((activity) => {
              const rowOpen = openRows.has(activity.id);
              const chip = rowChip(activity);
              return (
                <div className="tool-chip-item" key={activity.id}>
                  <button type="button" aria-expanded={rowOpen} onClick={() => toggleRow(activity.id)} className={`tool-chip-row is-${activity.status}`}>
                    <span className="tool-chip-icon">
                      <svg className="tool-chip-symbol" width="13" height="13" viewBox="0 0 24 24" fill={iconFor(activity) === "think" ? "currentColor" : "none"} stroke="currentColor" aria-hidden="true">{icons[iconFor(activity)]}</svg>
                    </span>
                    <span className="tool-chip-label">{rowLabel(activity)}</span>
                    <span className={`tool-chip-value${chip.mono ? " is-mono" : ""}`}>{chip.text}</span>
                    <svg className={`tool-chip-chevron${rowOpen ? " is-open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  <div className="tool-chip-detail-expand" aria-hidden={!rowOpen} inert={!rowOpen} style={{ gridTemplateRows: rowOpen ? "1fr" : "0fr", opacity: rowOpen ? 1 : 0 }}>
                    <div className="tool-chips-overflow"><pre className={activity.status === "error" ? "is-error" : ""}>{detailFor(activity)}</pre></div>
                  </div>
                </div>
              );
            })}

            {diffs.length > 0 && (
              <div className="tool-diff-chips">
                {diffs.map((diff) => (
                  <span className="tool-diff-chip" key={diff.file}>
                    <span>{diff.file}</span>
                    {diff.add !== undefined && <span className="is-add">+{diff.add}</span>}
                    {diff.del !== undefined && diff.del > 0 && <span className="is-del">−{diff.del}</span>}
                    {diff.add === undefined && diff.del === undefined && diff.changes !== undefined && <span className="is-change">{diff.changes} {diff.changes === 1 ? "change" : "changes"}</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
