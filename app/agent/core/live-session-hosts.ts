import type { SessionHost } from "./session-host";

type LiveSessionHostRecord = {
  jobId: string;
  sessionId: string;
  chatId: string;
  host: SessionHost;
  disposeAt: number;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

type LiveSessionHostRegistration = {
  jobId: string;
  sessionId: string;
  chatId: string;
  host: SessionHost;
};

const hostsByJobId = new Map<string, LiveSessionHostRecord>();
const hostsBySessionId = new Map<string, LiveSessionHostRecord>();
const HOST_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

function scheduleHostExpiry(record: LiveSessionHostRecord): void {
  if (record.timeoutId) {
    clearTimeout(record.timeoutId);
  }

  record.disposeAt = Date.now() + HOST_IDLE_TIMEOUT_MS;
  record.timeoutId = setTimeout(() => {
    void disposeLiveSessionHost(record.sessionId);
  }, HOST_IDLE_TIMEOUT_MS);
}

async function disposeLiveSessionHost(sessionId: string): Promise<void> {
  const record = hostsBySessionId.get(sessionId);
  if (!record) {
    return;
  }

  if (record.timeoutId) {
    clearTimeout(record.timeoutId);
    record.timeoutId = null;
  }

  hostsBySessionId.delete(sessionId);
  hostsByJobId.delete(record.jobId);
  await record.host.dispose();
}

export function registerLiveSessionHost(record: LiveSessionHostRegistration): void {
  const nextRecord: LiveSessionHostRecord = {
    ...record,
    disposeAt: Date.now() + HOST_IDLE_TIMEOUT_MS,
    timeoutId: null,
  };
  const existingForSession = hostsBySessionId.get(record.sessionId);
  if (existingForSession) {
    if (existingForSession.timeoutId) {
      clearTimeout(existingForSession.timeoutId);
    }
    hostsByJobId.delete(existingForSession.jobId);
  }
  hostsByJobId.set(nextRecord.jobId, nextRecord);
  hostsBySessionId.set(nextRecord.sessionId, nextRecord);
  scheduleHostExpiry(nextRecord);
}

export function unregisterLiveSessionJob(jobId: string): void {
  const record = hostsByJobId.get(jobId);
  if (!record) {
    return;
  }

  hostsByJobId.delete(jobId);
}

export function unregisterLiveSessionHost(sessionId: string): void {
  void disposeLiveSessionHost(sessionId);
}

export function getLiveSessionHostByJobId(jobId: string): LiveSessionHostRecord | null {
  const record = hostsByJobId.get(jobId) ?? null;
  if (record) {
    scheduleHostExpiry(record);
  }
  return record;
}

export function getLiveSessionHostBySessionId(sessionId: string): LiveSessionHostRecord | null {
  const record = hostsBySessionId.get(sessionId) ?? null;
  if (record) {
    scheduleHostExpiry(record);
  }
  return record;
}
