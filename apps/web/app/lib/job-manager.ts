/**
 * Background Job Manager for Agent Tasks (Redis-backed)
 * 
 * Allows agent work to continue even when client disconnects.
 * Uses Redis for persistence and in-memory callbacks for real-time updates.
 */

import Redis from "ioredis";
import type { AgentJob, AgentJobStep, JobEvent, SessionStreamSnapshot } from "../types/agent";
import { and, eq } from "drizzle-orm";
import { db, artifacts } from "./db";

const SLIDE_DATA_SCRIPT_RE = /<script\s+[^>]*id=["']slide-data["'][^>]*>/i;

type JobManagerState = {
  redis: Redis;
  localSubscribers: Map<string, Set<(event: JobEvent) => void>>;
  sessionSubscribers: Map<string, Set<(event: JobEvent) => void>>;
};

declare global {
  var __khadimJobManagerState: JobManagerState | undefined;
}

// Sequence assignment and stream append must be one atomic step: with two
// jobs broadcasting into the same session concurrently, a bare INCR followed
// by XADD can interleave so a higher sequence lands in the stream first, and
// the client's monotonic stale-event guard then drops the lower one.
const APPEND_SESSION_EVENT_LUA = `
local seq = redis.call('INCR', KEYS[1])
local payload = '{"sequence":' .. seq .. ',' .. string.sub(ARGV[1], 2)
local eventId = redis.call('XADD', KEYS[2], 'MAXLEN', '~', tonumber(ARGV[2]), '*', 'event', payload)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3]))
return {seq, eventId}
`;

type JobManagerRedis = Redis & {
  appendSessionEventAtomic(
    sequenceKey: string,
    streamKey: string,
    eventJson: string,
    maxLen: number,
    ttlSeconds: number,
  ): Promise<[number, string]>;
};

function createJobManagerState(): JobManagerState {
  const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

  redis.on("error", (err) => {
    console.error("Redis connection error:", err);
  });

  redis.on("connect", () => {
    console.log("Redis connected");
  });

  return {
    redis,
    localSubscribers: new Map<string, Set<(event: JobEvent) => void>>(),
    sessionSubscribers: new Map<string, Set<(event: JobEvent) => void>>(),
  };
}

const state = globalThis.__khadimJobManagerState ?? createJobManagerState();
globalThis.__khadimJobManagerState = state;

// Redis client for persistence
const { redis, localSubscribers, sessionSubscribers } = state;

redis.defineCommand("appendSessionEventAtomic", {
  numberOfKeys: 2,
  lua: APPEND_SESSION_EVENT_LUA,
});

// Key prefixes
const JOB_PREFIX = "agent:job:";
const ACTIVE_SESSION_JOBS_PREFIX = "agent:session:active:";
const ACTIVE_JOBS_BY_SESSION_PREFIX = "agent:session:jobs:";
const SESSION_EVENT_STREAM_PREFIX = "agent:session:events:";
const SESSION_SNAPSHOT_PREFIX = "agent:session:snapshot:";
const SESSION_SEQUENCE_PREFIX = "agent:session:sequence:";
const SESSION_EVENT_STREAM_MAX_LEN = 1000;
// Client retry state is persisted on disk by the desktop host, so request/job
// receipts must outlive short Redis stream/session windows.
const JOB_TTL_SECONDS = 30 * 24 * 60 * 60;

export type { AgentJob, AgentJobStep, JobEvent };

// In-memory subscribers for live job/session transports in this process.

function getActiveSessionJobsKey(chatId: string, sessionId: string) {
  return `${ACTIVE_SESSION_JOBS_PREFIX}${chatId}:${sessionId}`;
}

function getActiveJobsBySessionKey(sessionId: string) {
  return `${ACTIVE_JOBS_BY_SESSION_PREFIX}${sessionId}`;
}

function getSessionEventStreamKey(sessionId: string) {
  return `${SESSION_EVENT_STREAM_PREFIX}${sessionId}`;
}

function getSessionSnapshotKey(sessionId: string) {
  return `${SESSION_SNAPSHOT_PREFIX}${sessionId}`;
}

function getSessionSequenceKey(sessionId: string) {
  return `${SESSION_SEQUENCE_PREFIX}${sessionId}`;
}

function sortJobsByUpdatedAt(jobs: AgentJob[]) {
  return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function hydrateSlideArtifact(job: AgentJob): Promise<AgentJob> {
  const [indexHtmlArtifact] = await db
    .select({ content: artifacts.content })
    .from(artifacts)
    .where(and(eq(artifacts.chatId, job.chatId), eq(artifacts.filename, "index.html")))
    .limit(1);

  if (!indexHtmlArtifact?.content || !SLIDE_DATA_SCRIPT_RE.test(indexHtmlArtifact.content)) {
    return job;
  }

  return {
    ...job,
    fileContent: indexHtmlArtifact.content,
  };
}

async function hydrateJobs(jobs: AgentJob[]): Promise<AgentJob[]> {
  return Promise.all(jobs.map((job) => hydrateSlideArtifact(job)));
}

function createEmptySessionSnapshot(sessionId: string): SessionStreamSnapshot {
  return {
    sessionId,
    jobs: [],
    updatedAt: new Date().toISOString(),
  };
}

async function readStoredSessionSnapshot(sessionId: string): Promise<SessionStreamSnapshot | null> {
  const data = await redis.get(getSessionSnapshotKey(sessionId));
  return data ? (JSON.parse(data) as SessionStreamSnapshot) : null;
}

async function writeSessionSnapshot(snapshot: SessionStreamSnapshot): Promise<void> {
  await redis.set(getSessionSnapshotKey(snapshot.sessionId), JSON.stringify(snapshot), "EX", 3600);
}

// Rebuild the snapshot's job list from the active-jobs zset instead of
// read-modify-writing the stored JSON: with several jobs in one session,
// concurrent read-modify-writes lose each other's updates (dropped or
// resurrected jobs). The zset is updated atomically per job, so even when
// two syncs race, the last writer still stores the correct job list.
async function syncSessionSnapshot(sessionId: string, snapshotEventId?: string): Promise<void> {
  const stored = await readStoredSessionSnapshot(sessionId);
  const jobs = await collectActiveJobsBySession(sessionId);
  const nextSnapshot: SessionStreamSnapshot = {
    sessionId,
    jobs: sortJobsByUpdatedAt(jobs),
    updatedAt: new Date().toISOString(),
    snapshotEventId: snapshotEventId ?? stored?.snapshotEventId,
    snapshotSequence: Number.parseInt((await redis.get(getSessionSequenceKey(sessionId))) || "0", 10) || 0,
  };
  await writeSessionSnapshot(nextSnapshot);
}

async function touchActiveJob(job: Pick<AgentJob, "id" | "chatId" | "sessionId" | "status">): Promise<void> {
  if (job.status !== "running") {
    await redis.zrem(getActiveSessionJobsKey(job.chatId, job.sessionId), job.id);
    await redis.zrem(getActiveJobsBySessionKey(job.sessionId), job.id);
    return;
  }

  const score = Date.now();
  await redis.zadd(getActiveSessionJobsKey(job.chatId, job.sessionId), score, job.id);
  await redis.zadd(getActiveJobsBySessionKey(job.sessionId), score, job.id);
}

async function appendSessionEvent(event: JobEvent): Promise<JobEvent> {
  const streamKey = getSessionEventStreamKey(event.sessionId);
  const { sequence: _staleSequence, eventId: _staleEventId, ...payload } = event;
  const [sequence, eventId] = await (redis as JobManagerRedis).appendSessionEventAtomic(
    getSessionSequenceKey(event.sessionId),
    streamKey,
    JSON.stringify(payload),
    SESSION_EVENT_STREAM_MAX_LEN,
    3600,
  );

  const persistedEvent = { ...payload, eventId, sequence };
  await syncSessionSnapshot(event.sessionId, eventId);

  return persistedEvent;
}

function parseSessionEventEntries(entries: Array<[string, string[]]>): JobEvent[] {
  return entries.flatMap(([eventId, fields]) => {
    const eventIndex = fields.findIndex((value) => value === "event");
    const payload = eventIndex >= 0 ? fields[eventIndex + 1] : null;
    if (!payload) return [];

    try {
      const event = JSON.parse(payload) as JobEvent;
      return [{ ...event, eventId }];
    } catch (error) {
      console.error("[JobManager] Failed to parse replay event:", error);
      return [];
    }
  });
}

export async function getSessionEventsSince(sessionId: string, lastEventId?: string | null): Promise<JobEvent[]> {
  const streamKey = getSessionEventStreamKey(sessionId);
  const start = lastEventId ? `(${lastEventId}` : "-";
  const entries = await redis.xrange(streamKey, start, "+", "COUNT", 500);

  return parseSessionEventEntries(entries as Array<[string, string[]]>);
}

export async function getSessionSnapshot(sessionId: string): Promise<SessionStreamSnapshot> {
  const storedSnapshot = await readStoredSessionSnapshot(sessionId);
  if (storedSnapshot) {
    return {
      ...storedSnapshot,
      jobs: sortJobsByUpdatedAt(await hydrateJobs(storedSnapshot.jobs.filter((job) => job.status === "running"))),
    };
  }

  const jobs = await getActiveJobsBySession(sessionId);
  const snapshot = {
    ...createEmptySessionSnapshot(sessionId),
    jobs,
  } satisfies SessionStreamSnapshot;
  await writeSessionSnapshot(snapshot);
  return snapshot;
}

export async function createJob(id: string, chatId: string, sessionId = "default"): Promise<AgentJob> {
  const job: AgentJob = {
    id,
    chatId,
    sessionId,
    status: "running",
    steps: [],
    finalContent: "",
    previewUrl: null,
    sandboxId: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(JOB_PREFIX + id, JSON.stringify(job), "EX", JOB_TTL_SECONDS);
  await touchActiveJob(job);
  await syncSessionSnapshot(job.sessionId);
  console.log(`[JobManager] Created job ${id} for chat ${chatId}`);
  return job;
}

/** Atomically claim a client-supplied job id so concurrent retries start once. */
export async function claimJob(
  id: string,
  chatId: string,
  sessionId: string,
  requestFingerprint: string,
): Promise<{ job: AgentJob; created: boolean }> {
  const now = new Date().toISOString();
  const claimToken = crypto.randomUUID();
  const job: AgentJob = {
    id,
    chatId,
    sessionId,
    status: "running",
    steps: [],
    finalContent: "",
    previewUrl: null,
    sandboxId: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    requestFingerprint,
    launchState: "claiming",
    claimExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    claimToken,
  };
  const key = JOB_PREFIX + id;
  const serialized = JSON.stringify(job);
  let claimed = await redis.set(key, serialized, "EX", JOB_TTL_SECONDS, "NX");
  if (!claimed) {
    const raw = await redis.get(key);
    const staleClaim = raw ? JSON.parse(raw) as AgentJob : null;
    if (staleClaim?.launchState === "claiming"
      && staleClaim.requestFingerprint === requestFingerprint
      && Date.parse(staleClaim.claimExpiresAt ?? "") <= Date.now()) {
      const replaced = await redis.eval(
        "local value = redis.call('GET', KEYS[1]); if value == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]); return 1 end; return 0",
        1,
        key,
        raw!,
        serialized,
        String(JOB_TTL_SECONDS),
      );
      claimed = replaced === 1 ? "OK" : null;
    }
  }
  if (!claimed) {
    const existing = await getJob(id);
    if (!existing) throw new Error("The idempotent job claim expired before it could be recovered.");
    return { job: existing, created: false };
  }
  try {
    await touchActiveJob(job);
    await syncSessionSnapshot(job.sessionId);
    const owned = await redis.get(key);
    const ownedJob = owned ? JSON.parse(owned) as AgentJob : null;
    if (ownedJob?.claimToken !== claimToken) {
      const winner = await getJob(id);
      if (!winner) throw new Error("The job claim changed ownership before launch.");
      return { job: winner, created: false };
    }
    console.log(`[JobManager] Claimed job ${id} for chat ${chatId}`);
    return { job, created: true };
  } catch (error) {
    // No runner has started yet. Release the claim so the same idempotent
    // request can repair a partial indexing failure immediately.
    await redis.eval(
      "local value = redis.call('GET', KEYS[1]); if value == ARGV[1] then return redis.call('DEL', KEYS[1]) end; return 0",
      1,
      key,
      serialized,
    );
    await Promise.allSettled([
      redis.zrem(getActiveSessionJobsKey(chatId, sessionId), id),
      redis.zrem(getActiveJobsBySessionKey(sessionId), id),
    ]);
    await syncSessionSnapshot(sessionId).catch(() => undefined);
    throw error;
  }
}

export async function markJobStarted(id: string, requestFingerprint: string, claimToken: string): Promise<void> {
  const result = await redis.eval(
    "local raw = redis.call('GET', KEYS[1]); if not raw then return 0 end; local job = cjson.decode(raw); if job.requestFingerprint ~= ARGV[1] or job.claimToken ~= ARGV[2] then return -1 end; job.launchState = 'started'; job.claimExpiresAt = nil; redis.call('SET', KEYS[1], cjson.encode(job), 'EX', ARGV[3]); return 1",
    1,
    JOB_PREFIX + id,
    requestFingerprint,
    claimToken,
    String(JOB_TTL_SECONDS),
  );
  if (result !== 1) throw new Error("The launched job claim could not be promoted.");
}

export async function getJob(id: string): Promise<AgentJob | null> {
  const data = await redis.get(JOB_PREFIX + id);
  if (!data) {
    return null;
  }

  return hydrateSlideArtifact(JSON.parse(data) as AgentJob);
}

export async function getJobByChatId(chatId: string, sessionId?: string): Promise<AgentJob | null> {
  if (sessionId) {
    const jobIds = await redis.zrevrange(getActiveSessionJobsKey(chatId, sessionId), 0, 19);
    for (const jobId of jobIds) {
      const job = await getJob(jobId);
      if (job?.chatId === chatId && job.sessionId === sessionId && job.status === "running") {
        return job;
      }
      await redis.zrem(getActiveSessionJobsKey(chatId, sessionId), jobId);
    }
    return null;
  }

  const keys = await redis.keys(JOB_PREFIX + "*");
  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      const job = JSON.parse(data) as AgentJob;
      if (job.chatId === chatId && job.status === "running") {
        return job;
      }
    }
  }
  return null;
}

export async function getJobsByChatId(chatId: string, sessionId?: string): Promise<AgentJob[]> {
  if (sessionId) {
    const jobIds = await redis.zrevrange(getActiveSessionJobsKey(chatId, sessionId), 0, 19);
    const jobs: AgentJob[] = [];

    for (const jobId of jobIds) {
      const job = await getJob(jobId);
      if (job?.chatId === chatId && job.sessionId === sessionId && job.status === "running") {
        jobs.push(job);
        continue;
      }

      await redis.zrem(getActiveSessionJobsKey(chatId, sessionId), jobId);
    }

    return hydrateJobs(jobs);
  }

  const keys = await redis.keys(JOB_PREFIX + "*");
  const jobs: AgentJob[] = [];

  for (const key of keys) {
    const data = await redis.get(key);
    if (!data) continue;

    const job = JSON.parse(data) as AgentJob;
    if (job.chatId === chatId && job.status === "running") {
      jobs.push(job);
    }
  }

  return hydrateJobs(jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}

async function collectActiveJobsBySession(sessionId: string): Promise<AgentJob[]> {
  const jobIds = await redis.zrevrange(getActiveJobsBySessionKey(sessionId), 0, 49);
  const jobs: AgentJob[] = [];

  for (const jobId of jobIds) {
    const data = await redis.get(JOB_PREFIX + jobId);
    const job = data ? (JSON.parse(data) as AgentJob) : null;
    if (job?.sessionId === sessionId && job.status === "running") {
      jobs.push(job);
      continue;
    }

    await redis.zrem(getActiveJobsBySessionKey(sessionId), jobId);
  }

  return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getActiveJobsBySession(sessionId: string): Promise<AgentJob[]> {
  return hydrateJobs(await collectActiveJobsBySession(sessionId));
}

export async function updateJob(id: string, updates: Partial<AgentJob>): Promise<void> {
  const job = await getJob(id);
  if (job) {
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    await redis.set(JOB_PREFIX + id, JSON.stringify(job), "EX", JOB_TTL_SECONDS);
    await touchActiveJob(job);
    await syncSessionSnapshot(job.sessionId);
  }
}

export async function addStep(jobId: string, step: AgentJobStep): Promise<void> {
  const job = await getJob(jobId);
  if (job) {
    job.steps.push(step);
    job.updatedAt = new Date().toISOString();
    await redis.set(JOB_PREFIX + jobId, JSON.stringify(job), "EX", JOB_TTL_SECONDS);
    await touchActiveJob(job);
    await syncSessionSnapshot(job.sessionId);
  }
}

export async function updateStep(
  jobId: string,
  stepId: string,
  updates: Partial<AgentJobStep>
): Promise<void> {
  const job = await getJob(jobId);
  if (job) {
    const step = job.steps.find((s) => s.id === stepId);
    if (step) {
      Object.assign(step, updates);
      job.updatedAt = new Date().toISOString();
      await redis.set(JOB_PREFIX + jobId, JSON.stringify(job), "EX", JOB_TTL_SECONDS);
      await touchActiveJob(job);
      await syncSessionSnapshot(job.sessionId);
    }
  }
}

export async function completeJob(
  id: string,
  finalContent: string,
  previewUrl: string | null
): Promise<void> {
  const job = await getJob(id);
  if (job) {
    job.status = "completed";
    job.finalContent = finalContent;
    job.previewUrl = previewUrl;
    job.updatedAt = new Date().toISOString();
    await redis.set(JOB_PREFIX + id, JSON.stringify(job), "EX", JOB_TTL_SECONDS);
    await touchActiveJob(job);
    
    // Broadcast completion to local subscribers
    await broadcast(id, {
      type: "done",
      data: { content: finalContent, previewUrl },
      jobId: job.id,
      chatId: job.chatId,
      sessionId: job.sessionId,
    });
    console.log(`[JobManager] Job ${id} completed`);
  }
}

export async function failJob(id: string, error: string): Promise<void> {
  const job = await getJob(id);
  if (job) {
    job.status = "error";
    job.error = error;
    job.updatedAt = new Date().toISOString();
    await redis.set(JOB_PREFIX + id, JSON.stringify(job), "EX", JOB_TTL_SECONDS);
    await touchActiveJob(job);
    
    await broadcast(id, {
      type: "error",
      data: { message: error },
      jobId: job.id,
      chatId: job.chatId,
      sessionId: job.sessionId,
    });
    console.log(`[JobManager] Job ${id} failed: ${error}`);
  }
}

export async function cancelJob(id: string): Promise<void> {
  const job = await getJob(id);
  if (job) {
    job.status = "cancelled";
    job.updatedAt = new Date().toISOString();
    await redis.set(JOB_PREFIX + id, JSON.stringify(job), "EX", JOB_TTL_SECONDS);
    await touchActiveJob(job);
    
    // Broadcast cancellation (as error type 'cancelled' for now to fit existing frontend)
    await broadcast(id, {
      type: "error",
      data: { message: "Cancelled by user" },
      jobId: job.id,
      chatId: job.chatId,
      sessionId: job.sessionId,
    });
    console.log(`[JobManager] Job ${id} cancelled`);
  }
}

export function subscribe(
  jobId: string,
  callback: (event: JobEvent) => void
): () => void {
  if (!localSubscribers.has(jobId)) {
    localSubscribers.set(jobId, new Set());
  }
  localSubscribers.get(jobId)!.add(callback);
  console.log(`[JobManager] Subscribed to job ${jobId}`);
  
  return () => {
    const subscribers = localSubscribers.get(jobId);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        localSubscribers.delete(jobId);
      }
    }
    console.log(`[JobManager] Unsubscribed from job ${jobId}`);
  };
}

export async function subscribeToSession(
  sessionId: string,
  lastEventId: string | null | undefined,
  callback: (event: JobEvent) => void
): Promise<() => void> {
  const streamKey = getSessionEventStreamKey(sessionId);
  const subscriber = redis.duplicate({ lazyConnect: true });
  let closed = false;
  let cursor = lastEventId || "$";

  await subscriber.connect();
  console.log(`[JobManager] Subscribed to session stream ${sessionId} from ${cursor}`);

  const pump = (async () => {
    while (!closed) {
      try {
        const entries = await subscriber.call(
          "XREAD",
          "BLOCK",
          "30000",
          "COUNT",
          "100",
          "STREAMS",
          streamKey,
          cursor,
        ) as Array<[string, Array<[string, string[]]>]> | null;
        if (!entries || closed) {
          continue;
        }

        const [, streamEntries] = entries[0] ?? [];
        for (const event of parseSessionEventEntries((streamEntries || []) as Array<[string, string[]]>)) {
          cursor = event.eventId || cursor;
          callback(event);
        }
      } catch (error) {
        if (closed) {
          return;
        }
        console.error(`[JobManager] Session stream subscriber error for ${sessionId}:`, error);
      }
    }
  })();

  return () => {
    closed = true;
    void subscriber.disconnect();
    void pump.catch(() => {});
    console.log(`[JobManager] Unsubscribed from session stream ${sessionId}`);
  };
}

export async function broadcast(jobId: string, event: JobEvent): Promise<void> {
  const persistedEvent = await appendSessionEvent(event);

  const subscribers = localSubscribers.get(jobId);
  if (subscribers && subscribers.size > 0) {
    console.log(`[JobManager] Broadcasting ${persistedEvent.type} to ${subscribers.size} subscribers for job ${jobId}`);
    for (const callback of Array.from(subscribers)) {
      try {
        callback(persistedEvent);
      } catch (e) {
        console.error(`[JobManager] Subscriber error:`, e);
        subscribers.delete(callback);
      }
    }
  }

  const sessionListeners = sessionSubscribers.get(persistedEvent.sessionId);
  if (sessionListeners && sessionListeners.size > 0) {
    console.log(
      `[JobManager] Broadcasting ${persistedEvent.type} to ${sessionListeners.size} session subscribers for ${persistedEvent.sessionId}`
    );
    for (const callback of Array.from(sessionListeners)) {
      try {
        callback(persistedEvent);
      } catch (e) {
        console.error(`[JobManager] Session subscriber error:`, e);
        sessionListeners.delete(callback);
      }
    }
  }
}

export { redis };
