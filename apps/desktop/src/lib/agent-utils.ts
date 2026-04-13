import type { AgentInstance } from "./types";

/** Human-readable status text for an agent instance. */
export function agentStatusText(agent: AgentInstance): string {
  if (agent.status === "running" && agent.currentActivity) return agent.currentActivity;
  if (agent.status === "running") return "Working…";
  if (agent.status === "complete" && agent.finishedAt) return `Done ${relTimeShort(agent.finishedAt)}`;
  if (agent.status === "complete") return "Completed";
  if (agent.status === "error") return agent.errorMessage ?? "Error";
  return "Idle";
}

/** Tailwind text color class for a given agent status. */
export function agentStatusColorClass(status: AgentInstance["status"]): string {
  if (status === "running") return "text-[var(--color-accent)]";
  if (status === "error") return "text-[var(--color-danger-text-light)]";
  if (status === "complete") return "text-[var(--color-success-strong)]";
  return "text-[var(--text-muted)]";
}

/** Compact human status word. */
export function agentStatusWord(status: AgentInstance["status"]): string {
  if (status === "running") return "Running";
  if (status === "complete") return "Completed";
  if (status === "error") return "Error";
  return "Idle";
}

/** Format a large token count into a compact string. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/** Compact relative time — "now", "3m", "2h", "5d". */
export function relTimeShort(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  const ms = Date.now() - date.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Shorten a file path to fit a max character width. */
export function shortenPath(path: string, max = 48): string {
  if (path.length <= max) return path;
  const head = path.slice(0, 12);
  const tail = path.slice(-(max - head.length - 1));
  return `${head}…${tail}`;
}
