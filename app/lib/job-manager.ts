/**
 * Background Job Manager for Agent Tasks (Redis-backed)
 * 
 * Allows agent work to continue even when client disconnects.
 * Uses Redis for persistence and in-memory callbacks for real-time updates.
 */

import Redis from "ioredis";

// Redis client for persistence
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

redis.on("error", (err) => {
  console.error("Redis connection error:", err);
});

redis.on("connect", () => {
  console.log("Redis connected");
});

// Key prefixes
const JOB_PREFIX = "agent:job:";
const ACTIVE_SESSION_JOBS_PREFIX = "agent:session:active:";

import type { AgentJob, AgentJobStep, JobEvent } from "../types/agent";

export type { AgentJob, AgentJobStep, JobEvent };

// In-memory subscribers (process-local, for SSE connections)
const localSubscribers = new Map<string, Set<(event: JobEvent) => void>>();

function getActiveSessionJobsKey(chatId: string, sessionId: string) {
  return `${ACTIVE_SESSION_JOBS_PREFIX}${chatId}:${sessionId}`;
}

async function touchActiveJob(job: Pick<AgentJob, "id" | "chatId" | "sessionId" | "status">): Promise<void> {
  if (job.status !== "running") {
    await redis.zrem(getActiveSessionJobsKey(job.chatId, job.sessionId), job.id);
    return;
  }

  await redis.zadd(getActiveSessionJobsKey(job.chatId, job.sessionId), Date.now(), job.id);
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
  console.log(`[JobManager] Created job ${id} for chat ${chatId}`);
  return job;
}

export async function getJob(id: string): Promise<AgentJob | null> {
  const data = await redis.get(JOB_PREFIX + id);
  return data ? JSON.parse(data) : null;
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

export async function updateJob(id: string, updates: Partial<AgentJob>): Promise<void> {
  const job = await getJob(id);
  if (job) {
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    await redis.set(JOB_PREFIX + id, JSON.stringify(job), "EX", 3600);
    await touchActiveJob(job);
  }
}

export async function addStep(jobId: string, step: AgentJobStep): Promise<void> {
  const job = await getJob(jobId);
  if (job) {
    job.steps.push(step);
    job.updatedAt = new Date().toISOString();
    await redis.set(JOB_PREFIX + jobId, JSON.stringify(job), "EX", 3600);
    await touchActiveJob(job);
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
    broadcast(id, { type: "done", data: { content: finalContent, previewUrl } });
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
    
    broadcast(id, { type: "error", data: { message: error } });
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
    broadcast(id, { type: "error", data: { message: "Cancelled by user" } });
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

export function broadcast(jobId: string, event: JobEvent): void {
  const subscribers = localSubscribers.get(jobId);
  if (subscribers && subscribers.size > 0) {
    console.log(`[JobManager] Broadcasting ${event.type} to ${subscribers.size} subscribers for job ${jobId}`);
    for (const callback of Array.from(subscribers)) {
      try {
        callback(event);
      } catch (e) {
        console.error(`[JobManager] Subscriber error:`, e);
        subscribers.delete(callback);
      }
    }
  }
}

export { redis };
