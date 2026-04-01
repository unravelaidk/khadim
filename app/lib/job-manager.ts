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

type JobManagerState = {
  redis: Redis;
  localSubscribers: Map<string, Set<(event: JobEvent) => void>>;
  sessionSubscribers: Map<string, Set<(event: JobEvent) => void>>;
};

declare global {
  var __khadimJobManagerState: JobManagerState | undefined;
}

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

// Key prefixes
const JOB_PREFIX = "agent:job:";
const ACTIVE_SESSION_JOBS_PREFIX = "agent:session:active:";
const ACTIVE_JOBS_BY_SESSION_PREFIX = "agent:session:jobs:";
const SESSION_EVENT_STREAM_PREFIX = "agent:session:events:";
const SESSION_SNAPSHOT_PREFIX = "agent:session:snapshot:";
const SESSION_SEQUENCE_PREFIX = "agent:session:sequence:";
const SESSION_EVENT_STREAM_MAX_LEN = 1000;

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

  if (!indexHtmlArtifact?.content?.includes('<script id="slide-data"')) {
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

function upsertSessionSnapshotJob(snapshot: SessionStreamSnapshot, job: AgentJob): SessionStreamSnapshot {
  const jobs = snapshot.jobs.filter((existingJob) => existingJob.id !== job.id);
  if (job.status === "running") {
    jobs.push(job);
  }

  return {
    ...snapshot,
    jobs: sortJobsByUpdatedAt(jobs),
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

async function syncSessionSnapshotJob(job: AgentJob, snapshotEventId?: string): Promise<void> {
  const snapshot = (await readStoredSessionSnapshot(job.sessionId)) ?? createEmptySessionSnapshot(job.sessionId);
  const nextSnapshot = upsertSessionSnapshotJob(snapshot, job);
  if (snapshotEventId) {
    nextSnapshot.snapshotEventId = snapshotEventId;
  }
  nextSnapshot.snapshotSequence = Number.parseInt((await redis.get(getSessionSequenceKey(job.sessionId))) || "0", 10) || 0;
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
  const sequence = await redis.incr(getSessionSequenceKey(event.sessionId));
  const eventId = await redis.xadd(
    streamKey,
    "MAXLEN",
    "~",
    SESSION_EVENT_STREAM_MAX_LEN,
    "*",
    "event",
    JSON.stringify({ ...event, sequence })
  );

  await redis.expire(streamKey, 3600);
  await redis.expire(getSessionSequenceKey(event.sessionId), 3600);
  const persistedEvent = { ...event, eventId: eventId ?? undefined, sequence };

  const currentJob = await getJob(event.jobId);
  if (currentJob?.sessionId === event.sessionId) {
    await syncSessionSnapshotJob(currentJob, persistedEvent.eventId);
  }

  return persistedEvent;
}

export async function getSessionEventsSince(sessionId: string, lastEventId?: string | null): Promise<JobEvent[]> {
  const streamKey = getSessionEventStreamKey(sessionId);
  const start = lastEventId ? `(${lastEventId}` : "-";
  const entries = await redis.xrange(streamKey, start, "+", "COUNT", 500);

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
  
  await redis.set(JOB_PREFIX + id, JSON.stringify(job), "EX", 3600);
  await touchActiveJob(job);
  await syncSessionSnapshotJob(job);
  console.log(`[JobManager] Created job ${id} for chat ${chatId}`);
  return job;
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

export async function getActiveJobsBySession(sessionId: string): Promise<AgentJob[]> {
  const jobIds = await redis.zrevrange(getActiveJobsBySessionKey(sessionId), 0, 49);
  const jobs: AgentJob[] = [];

  for (const jobId of jobIds) {
    const job = await getJob(jobId);
    if (job?.sessionId === sessionId && job.status === "running") {
      jobs.push(job);
      continue;
    }

    await redis.zrem(getActiveJobsBySessionKey(sessionId), jobId);
  }

  return hydrateJobs(jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}

export async function updateJob(id: string, updates: Partial<AgentJob>): Promise<void> {
  const job = await getJob(id);
  if (job) {
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    await redis.set(JOB_PREFIX + id, JSON.stringify(job), "EX", 3600);
    await touchActiveJob(job);
    await syncSessionSnapshotJob(job);
  }
}

export async function addStep(jobId: string, step: AgentJobStep): Promise<void> {
  const job = await getJob(jobId);
  if (job) {
    job.steps.push(step);
    job.updatedAt = new Date().toISOString();
    await redis.set(JOB_PREFIX + jobId, JSON.stringify(job), "EX", 3600);
    await touchActiveJob(job);
    await syncSessionSnapshotJob(job);
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
      await redis.set(JOB_PREFIX + jobId, JSON.stringify(job), "EX", 3600);
      await touchActiveJob(job);
      await syncSessionSnapshotJob(job);
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
    await redis.set(JOB_PREFIX + id, JSON.stringify(job), "EX", 3600);
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
    await redis.set(JOB_PREFIX + id, JSON.stringify(job), "EX", 3600);
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
    await redis.set(JOB_PREFIX + id, JSON.stringify(job), "EX", 3600);
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

export function subscribeToSession(
  sessionId: string,
  callback: (event: JobEvent) => void
): () => void {
  if (!sessionSubscribers.has(sessionId)) {
    sessionSubscribers.set(sessionId, new Set());
  }

  sessionSubscribers.get(sessionId)!.add(callback);
  console.log(`[JobManager] Subscribed to session ${sessionId}`);

  return () => {
    const subscribers = sessionSubscribers.get(sessionId);
    if (subscribers) {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        sessionSubscribers.delete(sessionId);
      }
    }
    console.log(`[JobManager] Unsubscribed from session ${sessionId}`);
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
