import { CaretDown, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { AgentCoordinationActivity, AgentCoordinationWorker, AgentRun } from "../../../shared/types";
import { ModelIcon } from "../ui/ModelIcon";

interface CoordinationTraceProps {
  activity: AgentCoordinationActivity;
  runTitle: string;
  run?: Pick<AgentRun, "createdAt" | "completedAt" | "model">;
}

function compactModelName(model: string): string {
  return model
    .replace(/^models\//, "")
    .replace(/-(\d{8}|latest)$/i, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bGpt\b/g, "GPT")
    .replace(/\bAi\b/g, "AI");
}

function roleLabel(worker: AgentCoordinationWorker, index: number): string {
  if (worker.mode) return worker.mode.replace(/^Subagent\s*/i, "") || "Helper";
  if (worker.id.startsWith("delegate-explore-")) return "Explore";
  if (worker.id.startsWith("delegate-review-")) return "Review";
  return `Helper ${index + 1}`;
}

function statusLabel(status: AgentCoordinationWorker["status"]): string {
  if (status === "complete") return "Done";
  if (status === "failed") return "Failed";
  if (status === "blocked") return "Blocked";
  if (status === "queued") return "Idle";
  return "Running";
}

function durationLabel(start: string | undefined, end: string | undefined, now: number): string {
  const startTime = start ? Date.parse(start) : Number.NaN;
  const endTime = end ? Date.parse(end) : now;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return "—";
  const seconds = Math.max(0, Math.floor((endTime - startTime) / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

function contextPercent(worker: AgentCoordinationWorker): number | null {
  if (!worker.usage || !worker.contextWindow) return null;
  const contextTokens = worker.usage.input + worker.usage.cacheRead + worker.usage.output;
  return Math.min(100, Math.max(0, Math.round((contextTokens / worker.contextWindow) * 100)));
}

export function CoordinationTrace({ activity, runTitle: _runTitle, run }: CoordinationTraceProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const workers = activity.workers;
  const hasWorkers = workers.length > 0;
  const running = workers.filter((worker) => worker.status === "running").length;
  const idle = workers.filter((worker) => worker.status === "queued").length;
  const done = workers.filter((worker) => worker.status === "complete").length;
  const problems = workers.filter((worker) => worker.status === "failed" || worker.status === "blocked").length;
  const percentages = workers.map(contextPercent).filter((value): value is number => value !== null);
  const highestContextPercent = percentages.length > 0 ? Math.max(...percentages) : null;
  const runStart = activity.startedAt ?? run?.createdAt;
  const runEnd = activity.completedAt ?? run?.completedAt;

  useEffect(() => {
    if (!hasWorkers || activity.status === "complete" || activity.status === "failed") return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [activity.status, hasWorkers]);

  const healthCopy = useMemo(() => {
    if (problems > 0) return `${problems} agent${problems === 1 ? "" : "s"} need${problems === 1 ? "s" : ""} attention`;
    if (highestContextPercent !== null) {
      const boundary = Math.min(100, Math.max(10, Math.ceil(highestContextPercent / 10) * 10));
      return `All agents under ${boundary}% token limit`;
    }
    if (activity.status === "complete") return "All agents finished";
    return "Token usage updates as agents work";
  }, [activity.status, highestContextPercent, problems]);

  // Team mode is permission to delegate, not evidence that delegation
  // happened. Keep the transcript clean until a harness reports a real worker.
  if (!hasWorkers) return null;

  return (
    <section className={`coordination-trace${open ? " is-open" : ""}`} aria-label="Agent monitor">
      <button
        type="button"
        className="coordination-monitor-header"
        aria-label="Agent monitor"
        aria-expanded={open}
        aria-controls={`agent-monitor-${run?.createdAt ?? "current"}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>Agent monitor</span>
        <small>{healthCopy}</small>
        <CaretDown className="coordination-monitor-caret" size={14} aria-hidden="true" />
      </button>

      <div className="coordination-agent-disclosure" data-open={open || undefined}>
        <div id={`agent-monitor-${run?.createdAt ?? "current"}`}>
          <div className="coordination-agent-list">
            {workers.map((worker, index) => {
              const modelName = worker.modelName ?? (worker.model ? compactModelName(worker.model) : run?.model.name ?? "Agent");
              const modelId = worker.model ?? run?.model.model ?? modelName;
              const provider = worker.provider ?? run?.model.provider ?? "";
              const task = worker.activity ?? worker.error ?? worker.task ?? worker.summary ?? "On standby";
              return (
                <div className={`coordination-agent-row is-${worker.status}`} key={worker.id}>
                  <ModelIcon model={{ name: modelName, model: modelId, provider }} size={24} />
                  <div className="coordination-agent-model">
                    <strong title={modelId}>{modelName}</strong>
                    <span>{roleLabel(worker, index)}</span>
                  </div>
                  <p title={task}>{task}</p>
                  <em>{statusLabel(worker.status)}</em>
                  <time>{durationLabel(worker.startedAt ?? runStart, worker.completedAt, now)}</time>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="coordination-monitor-summary">
        <div className="coordination-counts" aria-label={`${running} running, ${idle} idle, ${done} done${problems ? `, ${problems} need attention` : ""}`}>
          <span className="is-running">{running} Running</span>
          <span className="is-idle">{idle} Idle</span>
          <span className="is-done">{done} Done</span>
          {problems > 0 && <span className="is-problem"><WarningCircle size={13} />{problems} Issue{problems === 1 ? "" : "s"}</span>}
        </div>
        <div className={`coordination-token-meter${highestContextPercent === null ? " is-pending" : ""}`}>
          <span
            role="progressbar"
            aria-label="Highest agent token usage"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={highestContextPercent ?? undefined}
          >
            <i style={{ transform: `scaleX(${(highestContextPercent ?? 0) / 100})` }} />
          </span>
          <strong>{highestContextPercent === null ? "—" : `${highestContextPercent}%`}</strong>
        </div>
        <time className="coordination-run-time" title="Team run duration">{durationLabel(runStart, runEnd, now)}</time>
      </footer>
    </section>
  );
}
