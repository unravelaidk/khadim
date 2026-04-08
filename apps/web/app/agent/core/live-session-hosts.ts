import type { SessionHost } from "./session-host";

type LiveSessionHostRecord = {
  jobId: string;
  sessionId: string;
  chatId: string;
  host: SessionHost;
};

type LiveSessionHostRegistration = {
  jobId: string;
  sessionId: string;
  chatId: string;
  host: SessionHost;
};

const hostsByJobId = new Map<string, LiveSessionHostRecord>();
const hostsBySessionId = new Map<string, LiveSessionHostRecord>();

export function registerLiveSessionHost(record: LiveSessionHostRegistration): void {
  const existing = hostsBySessionId.get(record.sessionId);
  if (existing) {
    hostsByJobId.delete(existing.jobId);
  }

  const nextRecord: LiveSessionHostRecord = { ...record };
  hostsByJobId.set(nextRecord.jobId, nextRecord);
  hostsBySessionId.set(nextRecord.sessionId, nextRecord);
}

export function unregisterLiveSessionJob(jobId: string): void {
  hostsByJobId.delete(jobId);
}

export function getLiveSessionHostByJobId(jobId: string): LiveSessionHostRecord | null {
  return hostsByJobId.get(jobId) ?? null;
}

export function getLiveSessionHostBySessionId(sessionId: string): LiveSessionHostRecord | null {
  return hostsBySessionId.get(sessionId) ?? null;
}
