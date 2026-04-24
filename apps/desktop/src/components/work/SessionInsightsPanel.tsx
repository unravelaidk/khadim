import React, { Suspense, lazy, useMemo, useState } from "react";
import type {
  ApprovalRequestRecord,
  ArtifactRecord,
  RunEventRecord,
} from "../../lib/bindings";
import type { SessionRecord } from "../../lib/types";
import { relTime } from "../../lib/ui";

const LazyFilePreviewCard = lazy(async () => {
  const mod = await import("./FilePreviewCard");
  return { default: mod.FilePreviewCard };
});

/* ═══════════════════════════════════════════════════════════════════════
   Session Insights Panel — the run's ambient context.
   Ordered by urgency: pending approvals → cost → source → artifacts →
   events preview. Events are a preview here — Log mode in the main
   surface is the primary audit view.
   ═══════════════════════════════════════════════════════════════════════ */

function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function fmtCostUsd(usd: number): string {
  if (usd < 0.01) return `<$0.01`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function eventDot(eventType: string, status: string | null): string {
  if (status === "error" || eventType.includes("error") || eventType.includes("failed")) return "var(--color-danger)";
  if (eventType.includes("approval") || eventType.includes("blocked")) return "var(--color-pop)";
  if (eventType.includes("completed") || eventType === "run_completed") return "var(--color-success)";
  return "var(--text-muted)";
}

function triggerCopy(trigger: SessionRecord["trigger"]): { label: string; icon: string; tint: string } {
  switch (trigger) {
    case "scheduled": return { label: "Scheduled run",  icon: "ri-time-line",      tint: "var(--tint-sky)" };
    case "event":     return { label: "Queue triggered", icon: "ri-inbox-line",     tint: "var(--tint-violet)" };
    case "chat":      return { label: "From chat",       icon: "ri-chat-3-line",    tint: "var(--tint-warm)" };
    case "manual":
    default:          return { label: "Manual run",      icon: "ri-cursor-line",    tint: "var(--tint-amber)" };
  }
}

/* ── Section ─ collapsible, with count + chevron ─────────────── */

function Section({
  title,
  count,
  children,
  defaultOpen = true,
  tone = "default",
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  tone?: "default" | "alert";
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-[var(--glass-border)] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--glass-bg)]/40"
      >
        <span className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {title}
          {count != null && count > 0 && (
            <span
              className={`rounded-full px-1.5 py-px text-[10px] tabular-nums ${
                tone === "alert"
                  ? "text-[var(--color-danger-text)]"
                  : "text-[var(--text-secondary)]"
              }`}
              style={{
                background: tone === "alert" ? "var(--tint-rose)" : "var(--glass-bg)",
              }}
            >
              {count}
            </span>
          )}
        </span>
        <i
          className={`ri-arrow-down-s-line text-base leading-none text-[var(--text-muted)] transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

/* ── Metric row — label / value on one line ─────────────────── */

function Metric({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <span
        className={`text-[12px] font-medium tabular-nums text-[var(--text-primary)] ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Panel ──────────────────────────────────────────────────── */

interface SessionInsightsPanelProps {
  session: SessionRecord;
  events: RunEventRecord[];
  artifacts: ArtifactRecord[];
  approvals: ApprovalRequestRecord[];
  isDecidingApproval?: boolean;
  onDecideApproval?: (approvalId: string, decision: "approve" | "deny") => void;
  /** Switch the main surface to Log mode — used by the "show all" links. */
  onOpenLog?: () => void;
  /** Absolute working directory for this run — used to resolve relative
   *  artifact paths in inline file previews. */
  runWorkDir?: string | null;
}

export function SessionInsightsPanel({
  session,
  events,
  artifacts,
  approvals,
  isDecidingApproval = false,
  onDecideApproval,
  onOpenLog,
  runWorkDir,
}: SessionInsightsPanelProps) {
  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.status === "pending"),
    [approvals],
  );
  const resolvedApprovals = useMemo(
    () => approvals.filter((a) => a.status !== "pending"),
    [approvals],
  );

  const tokenTotal =
    (session.tokenUsage?.inputTokens ?? 0) + (session.tokenUsage?.outputTokens ?? 0);
  const estimatedCost = session.tokenUsage
    ? (session.tokenUsage.inputTokens * 3 + session.tokenUsage.outputTokens * 15) / 1_000_000
    : 0;

  const trig = triggerCopy(session.trigger);
  const recentEvents = useMemo(() => events.slice(-6).reverse(), [events]);

  return (
    <div className="flex flex-col">
      {/* ── Approvals ─ pending first, they block the run ─────── */}
      {(pendingApprovals.length > 0 || resolvedApprovals.length > 0) && (
        <Section
          title="Approvals"
          count={pendingApprovals.length || approvals.length}
          tone={pendingApprovals.length > 0 ? "alert" : "default"}
        >
          {pendingApprovals.length === 0 && resolvedApprovals.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">No approval requests.</p>
          )}
          <ul className="space-y-2">
            {pendingApprovals.map((req) => (
              <li
                key={req.id}
                className="depth-card-sm rounded-[var(--radius-sm)] px-3 py-2.5"
                style={{ background: "var(--tint-rose)" }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[var(--color-danger)] status-pulse"
                  />
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-danger-text)]">
                    {req.risk_level}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">
                    · {req.scope}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] font-medium text-[var(--text-primary)]">
                  {req.action_title}
                </p>
                {onDecideApproval && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isDecidingApproval}
                      onClick={() => onDecideApproval(req.id, "approve")}
                      className="btn-ink h-7 rounded-full px-3 text-[11px] font-medium disabled:opacity-40"
                    >
                      Allow
                    </button>
                    <button
                      type="button"
                      disabled={isDecidingApproval}
                      onClick={() => onDecideApproval(req.id, "deny")}
                      className="h-7 rounded-full px-3 text-[11px] font-medium text-[var(--color-danger-text)] transition-colors hover:bg-[var(--color-danger-muted)] disabled:opacity-40"
                    >
                      Deny
                    </button>
                  </div>
                )}
              </li>
            ))}
            {resolvedApprovals.slice(0, 3).map((req) => (
              <li key={req.id} className="flex items-baseline gap-2 text-xs">
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
                    req.status === "approved"
                      ? "text-[var(--color-success-text)]"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {req.status}
                </span>
                <span className="truncate text-[var(--text-secondary)]">{req.action_title}</span>
                {req.resolved_at && (
                  <span className="ml-auto shrink-0 text-[var(--text-muted)]">
                    {relTime(req.resolved_at)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Cost & Budget ─ live run economics ─────────────────── */}
      <Section title="Cost">
        <div className="flex flex-col">
          <Metric
            label="Runtime"
            value={session.durationMs != null ? fmtDuration(session.durationMs) : "—"}
          />
          <Metric
            label="Tokens in"
            value={session.tokenUsage ? fmtTokens(session.tokenUsage.inputTokens) : "—"}
          />
          <Metric
            label="Tokens out"
            value={session.tokenUsage ? fmtTokens(session.tokenUsage.outputTokens) : "—"}
          />
          <Metric label="Total" value={tokenTotal > 0 ? fmtTokens(tokenTotal) : "—"} />
          <div className="mt-2 border-t border-[var(--glass-border)] pt-2">
            <Metric
              label="Est. cost"
              value={estimatedCost > 0 ? fmtCostUsd(estimatedCost) : "—"}
            />
          </div>
        </div>
      </Section>

      {/* ── Source ─ how this run was triggered ────────────────── */}
      <Section title="Source" defaultOpen={false}>
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: trig.tint }}
          >
            <i className={`${trig.icon} text-[15px] leading-none text-[var(--text-primary)]`} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-[var(--text-primary)]">{trig.label}</p>
            {session.startedAt && (
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                started {relTime(session.startedAt)}
              </p>
            )}
          </div>
        </div>
        {session.agentName && (
          <div className="mt-3 flex items-baseline justify-between text-[11px]">
            <span className="text-[var(--text-muted)]">Agent</span>
            <span className="truncate text-[var(--text-primary)]" title={session.agentName}>
              {session.agentName}
            </span>
          </div>
        )}
      </Section>

      {/* ── Artifacts ──────────────────────────────────────────── */}
      <Section title="Artifacts" count={artifacts.length} defaultOpen={artifacts.length > 0}>
        {artifacts.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No artifacts captured yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {artifacts.map((artifact) => (
              <li key={artifact.id}>
                <div className="flex items-baseline gap-2">
                  <span
                    className="inline-flex h-4 items-center rounded-full px-1.5 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--text-primary)]"
                    style={{ background: "var(--tint-lime)" }}
                  >
                    {artifact.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-primary)]">
                    {artifact.label}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  {fmtBytes(artifact.size_bytes)}
                  {artifact.mime_type ? ` · ${artifact.mime_type}` : ""}
                </p>
                {artifact.path && (
                  <Suspense fallback={<div className="depth-inset mt-2 h-10 rounded-[var(--radius-sm)]" />}>
                    <LazyFilePreviewCard
                      path={artifact.path}
                      label={artifact.label}
                      root={runWorkDir ?? null}
                    />
                  </Suspense>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Events preview ─ teaser to full Log view ──────────── */}
      <Section title="Recent events" count={events.length} defaultOpen={false}>
        {events.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No events recorded yet.</p>
        ) : (
          <>
            <ol className="space-y-2">
              {recentEvents.map((evt) => (
                <li key={evt.id} className="flex gap-2">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: eventDot(evt.event_type, evt.status) }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-[var(--text-primary)]">
                      {evt.title ?? evt.event_type}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      {evt.source} · {relTime(evt.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {onOpenLog && (
              <button
                type="button"
                onClick={onOpenLog}
                className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                Open full log →
              </button>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
