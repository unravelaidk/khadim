export function relTime(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  const ms = Date.now() - date.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function backendLabel(backend: string) {
  if (backend === "opencode") return "OpenCode";
  if (backend === "claude_code") return "Claude Code";
  if (backend === "khadim") return "Khadim";
  return backend;
}

export function executionTargetLabel(target: string) {
  return target === "sandbox" ? "Sandbox" : "Local";
}

export function formatMessageTime(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function extractSessionId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const direct = record.sessionID ?? record.sessionId ?? record.id;
  if (typeof direct === "string") return direct;
  for (const key of ["data", "session", "result"]) {
    const nested = record[key];
    const nestedId = extractSessionId(nested);
    if (nestedId) return nestedId;
  }
  return null;
}
