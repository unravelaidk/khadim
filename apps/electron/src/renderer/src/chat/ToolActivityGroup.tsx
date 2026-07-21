import {
  CaretDown as ChevronDown,
  CheckCircle as CircleCheck,
  FileText,
  NotePencil as FilePenLine,
  GlobeHemisphereWest as Globe2,
  MagnifyingGlass as Search,
  TerminalWindow as SquareTerminal,
  MagicWand as WandSparkles,
  X,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { ToolCallActivity } from "../../../shared/types";
import { Logo } from "../ui/Logo";

function friendlyToolTitle(activity: ToolCallActivity): string {
  const path = typeof activity.metadata?.path === "string" ? activity.metadata.path : null;
  const filename = path?.split(/[\\/]/).filter(Boolean).at(-1);
  if (activity.tool === "artifact_edit") return activity.title || "Updated artifact";
  if (activity.tool === "bash" || activity.tool === "shell") return activity.status === "running" ? "Running command" : "Ran command";
  if (activity.tool === "edit" || activity.tool === "write") return `${activity.status === "running" ? "Editing" : "Edited"} ${filename ?? "file"}`;
  if (activity.tool === "read") return `${activity.status === "running" ? "Reading" : "Read"} ${filename ?? "file"}`;
  if (activity.tool === "web_search" && activity.metadata?.degraded === true) return activity.title;
  if (activity.tool === "grep" || activity.tool === "glob" || activity.tool === "web_search") return activity.status === "running" ? "Searching" : "Search complete";
  if (activity.tool === "web_fetch" || activity.tool === "webfetch") return activity.status === "running" ? "Fetching page" : "Web fetch";
  if (activity.tool.includes("task") || activity.tool.includes("todo")) return "Task update";
  const label = activity.title || activity.tool.replaceAll("_", " ");
  return activity.status === "running" ? `Using ${label}` : `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function toolIcon(activity: ToolCallActivity): React.ReactNode {
  if (activity.status === "error") return <X size={17} />;
  if (activity.tool === "artifact_edit") return <WandSparkles size={17} />;
  if (activity.tool === "bash" || activity.tool === "shell") return <SquareTerminal size={17} />;
  if (activity.tool === "edit" || activity.tool === "write") return <FilePenLine size={17} />;
  if (activity.tool === "read") return <FileText size={17} />;
  if (activity.tool === "grep" || activity.tool === "glob" || activity.tool === "web_search") return <Search size={17} />;
  if (activity.tool === "web_fetch" || activity.tool === "webfetch") return <Globe2 size={17} />;
  if (activity.status === "complete") return <CircleCheck size={17} />;
  return <WandSparkles size={17} />;
}

function parseToolDetail(value?: string): { content: string; format: "json" | "text" } {
  if (!value) return { content: "No additional output.", format: "text" };
  try {
    return { content: JSON.stringify(JSON.parse(value), null, 2), format: "json" };
  } catch {
    return { content: value, format: "text" };
  }
}

function JsonDetail({ content }: { content: string }): React.JSX.Element {
  const tokenPattern = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const tokens: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of content.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push(content.slice(cursor, index));
    const token = match[0];
    const className = match[2] ? "json-key" : token.startsWith("\"") ? "json-string" : token === "null" ? "json-null" : token === "true" || token === "false" ? "json-boolean" : "json-number";
    tokens.push(<span className={className} key={`${index}-${token}`}>{token}</span>);
    cursor = index + token.length;
  }
  if (cursor < content.length) tokens.push(content.slice(cursor));

  return <pre>{tokens}</pre>;
}

export function ToolActivityGroup({ activities }: { activities: ToolCallActivity[] }): React.JSX.Element {
  const hasRunning = activities.some((activity) => activity.status === "running");
  const [expanded, setExpanded] = useState(hasRunning);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (hasRunning) setExpanded(true);
  }, [hasRunning]);
  const editedFiles = new Set(activities.flatMap((activity) => {
    if (activity.tool !== "edit" && activity.tool !== "write" && activity.tool !== "artifact_edit") return [];
    return typeof activity.metadata?.path === "string" ? [activity.metadata.path] : [];
  })).size;
  const commands = activities.filter((activity) => activity.tool === "bash" || activity.tool === "shell").length;
  const artifactEdits = activities.filter((activity) => activity.tool === "artifact_edit").length;
  const summary = [
    `${activities.length} tool${activities.length === 1 ? "" : "s"}`,
    editedFiles > 0 ? `edited ${editedFiles} file${editedFiles === 1 ? "" : "s"}` : null,
    artifactEdits > 0 ? `updated ${artifactEdits} artifact${artifactEdits === 1 ? "" : "s"}` : null,
    commands > 0 ? `ran ${commands} command${commands === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(", ");

  return (
    <section className={`tool-activity ${hasRunning ? "is-running" : ""}`}>
      <button className="tool-activity-header" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
        <span className="tool-activity-mark"><Logo /></span>
        <strong>{hasRunning ? `Working with ${summary}` : summary}</strong>
        {hasRunning && <span className="tool-running-label">Working</span>}
        <ChevronDown className={expanded ? "expanded" : ""} size={17} />
      </button>
      {expanded && (
        <div className="tool-timeline">
          {activities.map((activity) => {
            const selected = selectedId === activity.id;
            const detail = activity.status === "complete" || activity.status === "error" ? activity.result : activity.input;
            const parsedDetail = parseToolDetail(detail);
            const chip = typeof activity.metadata?.exit_code === "number"
              ? `exit ${activity.metadata.exit_code}`
              : typeof activity.metadata?.changeCount === "number"
                ? `${activity.metadata.changeCount} change${activity.metadata.changeCount === 1 ? "" : "s"}`
                : null;
            return (
              <div className={`tool-event ${activity.status}`} key={activity.id}>
                <button className="tool-event-row" onClick={() => setSelectedId(selected ? null : activity.id)} aria-expanded={selected} aria-label={`${friendlyToolTitle(activity)} details`}>
                  <span className="tool-event-icon"><span className="tool-state-icon" key={activity.status}>{activity.status === "running" ? <span className="activity-spinner" /> : toolIcon(activity)}</span></span>
                  <span className="tool-event-copy"><strong>{friendlyToolTitle(activity)}</strong>{typeof activity.metadata?.path === "string" && <small>{activity.metadata.path}</small>}</span>
                  {chip && <span className="tool-event-chip">{chip}</span>}
                  <ChevronDown className={selected ? "expanded" : ""} size={15} />
                </button>
                {selected && (
                  <div className="tool-detail">
                    <div className="tool-detail-heading">
                      <span>{parsedDetail.format === "json" ? "JSON" : activity.status === "running" ? "Input" : activity.status === "error" ? "Error" : "Result"}</span>
                      <small>{parsedDetail.content.length.toLocaleString()} characters</small>
                    </div>
                    {parsedDetail.format === "json" ? <JsonDetail content={parsedDetail.content} /> : <pre>{parsedDetail.content}</pre>}
                  </div>
                )}
              </div>
            );
          })}
          {!hasRunning && <div className="tool-finish"><CircleCheck size={17} /><span>Done</span></div>}
        </div>
      )}
    </section>
  );
}
