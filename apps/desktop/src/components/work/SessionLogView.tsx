import React, { Suspense, lazy, useEffect, useMemo, useState, startTransition } from "react";
import type { RunEventRecord } from "../../lib/bindings";

/* ═══════════════════════════════════════════════════════════════════════
   Session Log — structured run_events timeline.
   Sibling surface to the Chat transcript. Same session, different lens.
   ═══════════════════════════════════════════════════════════════════════ */

type FilterId = "all" | "tools" | "approvals" | "artifacts" | "errors";

type Category = {
  id: "run" | "step" | "tool" | "approval" | "budget" | "artifact" | "queue" | "integration" | "error" | "other";
  tint: string;
  icon: string;
  label: string;
};

type CategorizedEvent = {
  event: RunEventRecord;
  category: Category;
};

const INITIAL_RENDER_COUNT = 120;
const RENDER_BATCH_SIZE = 200;

const LazyFilePreviewCard = lazy(async () => {
  const mod = await import("./FilePreviewCard");
  return { default: mod.FilePreviewCard };
});

function categorize(event: RunEventRecord): Category {
  const t = event.event_type;
  if (t.includes("error") || t.includes("failed") || event.status === "error") {
    return { id: "error", tint: "var(--tint-rose)", icon: "ri-error-warning-line", label: "Error" };
  }
  if (t.startsWith("run_"))         return { id: "run",         tint: "var(--tint-sky)",    icon: "ri-play-circle-line",   label: "Run" };
  if (t.startsWith("step_"))        return { id: "step",        tint: "var(--tint-warm)",   icon: "ri-dashboard-line",     label: "Step" };
  if (t.startsWith("tool_"))        return { id: "tool",        tint: "var(--tint-amber)",  icon: "ri-tools-line",         label: "Tool" };
  if (t.startsWith("approval_"))    return { id: "approval",    tint: "var(--tint-rose)",   icon: "ri-shield-check-line",  label: "Approval" };
  if (t.startsWith("budget_"))      return { id: "budget",      tint: "var(--tint-rose)",   icon: "ri-coin-line",          label: "Budget" };
  if (t.includes("artifact"))       return { id: "artifact",    tint: "var(--tint-lime)",   icon: "ri-file-line",          label: "Artifact" };
  if (t.startsWith("queue_"))       return { id: "queue",       tint: "var(--tint-violet)", icon: "ri-inbox-line",         label: "Queue" };
  if (t.startsWith("integration_")) return { id: "integration", tint: "var(--tint-teal)",   icon: "ri-plug-line",          label: "Integration" };
  return { id: "other", tint: "var(--glass-bg-strong)", icon: "ri-circle-line", label: "Event" };
}

function fmtClock(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function humanize(event_type: string): string {
  return event_type.replace(/_/g, " ");
}

function tryPrettyJson(json: string): string | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || (typeof parsed === "object" && Object.keys(parsed).length === 0)) return null;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return json.trim() || null;
  }
}

/* Extract a filesystem path referenced by an event, if present. */
/* We look at a short set of metadata keys that the backend emits for */
/* artifact and file-touching tool events. Returns null when no path */
/* that looks like a real filesystem path is found.                  */
const FILE_PATH_KEYS = [
  "path",
  "file_path",
  "filePath",
  "absolute_path",
  "absolutePath",
  "artifact_path",
  "artifactPath",
  "target_path",
  "targetPath",
  "output_path",
  "outputPath",
];

function looksLikePath(value: string): boolean {
  if (value.length === 0 || value.length > 1024) return false;
  if (value.includes("\n")) return false;
  if (value.startsWith("/")) return true;                  // unix absolute
  if (/^[a-zA-Z]:[\\/]/.test(value)) return true;          // windows drive
  if (value.startsWith("~/") || value.startsWith("./")) return true;
  return value.includes("/") || value.includes("\\");
}

function extractFilePath(event: RunEventRecord): string | null {
  if (!event.metadata_json) return null;
  try {
    const meta = JSON.parse(event.metadata_json) as Record<string, unknown> | null;
    if (!meta || typeof meta !== "object") return null;
    for (const key of FILE_PATH_KEYS) {
      const raw = meta[key];
      if (typeof raw === "string" && looksLikePath(raw)) return raw;
    }
  } catch {
    /* metadata wasn't JSON; ignore */
  }
  return null;
}

export function SessionLogView({
  events,
  isLive,
}: {
  events: RunEventRecord[];
  isLive: boolean;
}) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const categorizedEvents = useMemo<CategorizedEvent[]>(() => {
    const out: CategorizedEvent[] = new Array(events.length);
    for (let i = 0; i < events.length; i++) {
      const event = events[events.length - 1 - i];
      out[i] = { event, category: categorize(event) };
    }
    return out;
  }, [events]);

  const counts = useMemo(() => {
    const c = { tools: 0, approvals: 0, artifacts: 0, errors: 0 };
    for (const processed of categorizedEvents) {
      if (processed.category.id === "tool")     c.tools++;
      if (processed.category.id === "approval") c.approvals++;
      if (processed.category.id === "artifact") c.artifacts++;
      if (processed.category.id === "error")    c.errors++;
    }
    return c;
  }, [categorizedEvents]);

  const filters: { id: FilterId; label: string; count: number }[] = [
    { id: "all",        label: "All",        count: categorizedEvents.length },
    { id: "tools",      label: "Tools",      count: counts.tools },
    { id: "approvals",  label: "Approvals",  count: counts.approvals },
    { id: "artifacts",  label: "Artifacts",  count: counts.artifacts },
    { id: "errors",     label: "Errors",     count: counts.errors },
  ];

  const visible = useMemo(() => {
    if (filter === "all") return categorizedEvents;
    return categorizedEvents.filter((processed) => {
      if (filter === "tools")      return processed.category.id === "tool";
      if (filter === "approvals")  return processed.category.id === "approval";
      if (filter === "artifacts")  return processed.category.id === "artifact";
      if (filter === "errors")     return processed.category.id === "error";
      return true;
    });
  }, [filter, categorizedEvents]);

  const [renderCount, setRenderCount] = useState(() => Math.min(INITIAL_RENDER_COUNT, visible.length));

  useEffect(() => {
    startTransition(() => {
      setRenderCount(Math.min(INITIAL_RENDER_COUNT, visible.length));
    });
  }, [filter]);

  useEffect(() => {
    setRenderCount((current) => Math.min(current, visible.length));
  }, [visible.length]);

  useEffect(() => {
    if (renderCount >= visible.length) return;
    const frame = window.requestAnimationFrame(() => {
      startTransition(() => {
        setRenderCount((current) => Math.min(current + RENDER_BATCH_SIZE, visible.length));
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renderCount, visible.length]);

  const renderedEvents = useMemo(
    () => visible.slice(0, renderCount),
    [renderCount, visible],
  );

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Filter strip ─────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--glass-border)] px-6 py-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              disabled={f.id !== "all" && f.count === 0}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all disabled:opacity-30 ${
                filter === f.id
                  ? "depth-card-sm text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] enabled:hover:text-[var(--text-secondary)]"
              }`}
            >
              {f.label}
              <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Log body ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl px-6 py-6">
          {visible.length === 0 ? (
            <div className="depth-well px-6 py-14 text-center">
              <p className="text-[13px] text-[var(--text-secondary)]">
                {isLive && filter === "all"
                  ? "Waiting for the first event…"
                  : filter === "all"
                    ? "No events recorded."
                    : `No ${filter} in this session.`}
              </p>
              {!isLive && filter === "all" && (
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                  Lifecycle, tool calls, approvals, and budgets land here.
                </p>
              )}
            </div>
          ) : (
            <ol className="flex flex-col">
              {renderedEvents.map((processed) => (
                <SessionLogRow
                  key={processed.event.id}
                  event={processed.event}
                  category={processed.category}
                  isExpanded={expanded.has(processed.event.id)}
                  onToggleExpanded={toggleExpanded}
                />
              ))}
            </ol>
          )}

          {renderCount < visible.length && (
            <div className="mt-4 pl-[4.5rem] font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Rendering {renderCount} of {visible.length} events...
            </div>
          )}

          {isLive && visible.length > 0 && (
            <div className="mt-6 flex items-center gap-2 pl-[4.5rem]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-pop)] status-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                listening for events
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SessionLogRow = React.memo(function SessionLogRow({
  event,
  category,
  isExpanded,
  onToggleExpanded,
}: {
  event: RunEventRecord;
  category: Category;
  isExpanded: boolean;
  onToggleExpanded: (id: string) => void;
}) {
  const createdAtLabel = useMemo(() => fmtClock(event.created_at), [event.created_at]);
  const eventTypeLabel = useMemo(() => humanize(event.event_type), [event.event_type]);
  const title = event.title ?? eventTypeLabel;
  const prettyMetadata = useMemo(() => tryPrettyJson(event.metadata_json), [event.metadata_json]);
  const filePath = useMemo(() => extractFilePath(event), [event]);
  const hasMeta = prettyMetadata != null;

  return (
    <li
      className="relative flex gap-4 py-2.5"
      style={{ contentVisibility: "auto", containIntrinsicSize: "140px" }}
    >
      <div className="w-14 shrink-0 pt-[3px] text-right">
        <span className="font-mono text-[10px] tabular-nums leading-none text-[var(--text-muted)]">
          {createdAtLabel}
        </span>
      </div>

      <span
        className="mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: category.tint }}
        title={category.label}
      >
        <i className={`${category.icon} text-[11px] leading-none text-[var(--text-primary)]`} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[12px] font-medium text-[var(--text-primary)]">{title}</span>
          <span className="font-mono text-[10px] tracking-tight text-[var(--text-muted)]">{eventTypeLabel}</span>
          {event.tool_name && (
            <span className="font-mono text-[10px] text-[var(--text-secondary)]">
              · {event.tool_name}
            </span>
          )}
        </div>

        {event.content && (
          <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--text-secondary)]">
            {event.content}
          </p>
        )}

        {filePath && (
          <Suspense
            fallback={<div className="depth-inset mt-2 h-10 rounded-[var(--radius-sm)]" />}
          >
            <LazyFilePreviewCard path={filePath} />
          </Suspense>
        )}

        <div className="mt-1 flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {event.source}
          </span>
          {hasMeta && (
            <button
              type="button"
              onClick={() => onToggleExpanded(event.id)}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              {isExpanded ? "hide detail" : "detail"}
            </button>
          )}
        </div>

        {isExpanded && prettyMetadata && (
          <pre className="depth-inset mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {prettyMetadata}
          </pre>
        )}
      </div>
    </li>
  );
});
