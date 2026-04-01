import { getSessionEventsSince, getSessionSnapshot, subscribeToSession } from "../lib/job-manager";
import type { AgentJob, JobEvent, SessionStreamSnapshot } from "../types/agent";

export interface SessionTransportEvent {
  type: string;
  eventId?: string;
  sequence?: number;
  [key: string]: unknown;
}

function toJobSnapshotEvent(job: AgentJob): SessionTransportEvent {
  return {
    type: "job_snapshot",
    jobId: job.id,
    chatId: job.chatId,
    sessionId: job.sessionId,
    status: job.status,
    steps: job.steps,
    finalContent: job.finalContent,
    previewUrl: job.previewUrl,
    fileContent: job.fileContent,
    sandboxId: job.sandboxId,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function toSessionSnapshotEvent(snapshot: SessionStreamSnapshot): SessionTransportEvent {
  return {
    type: "session_snapshot",
    sessionId: snapshot.sessionId,
    snapshotEventId: snapshot.snapshotEventId,
    snapshotSequence: snapshot.snapshotSequence,
    jobs: snapshot.jobs,
    updatedAt: snapshot.updatedAt,
  };
}

export function toJobEventMessage(event: JobEvent): SessionTransportEvent {
  return {
    type: event.type,
    eventId: event.eventId,
    sequence: event.sequence,
    jobId: event.jobId,
    chatId: event.chatId,
    sessionId: event.sessionId,
    ...event.data,
  };
}

export interface ConnectSessionStreamOptions {
  sessionId: string;
  lastEventId?: string | null;
  send: (event: SessionTransportEvent) => void;
  sendJobSnapshot?: boolean;
}

export async function connectSessionStream({
  sessionId,
  lastEventId,
  send,
  sendJobSnapshot = false,
}: ConnectSessionStreamOptions): Promise<() => void> {
  let cleanedUp = false;

  const cleanup = (unsubscribe?: () => void) => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    unsubscribe?.();
  };

  send({ type: "session_connected", sessionId });

  const replayEvents = lastEventId ? await getSessionEventsSince(sessionId, lastEventId) : [];
  if (replayEvents.length > 0) {
    for (const event of replayEvents) {
      send(toJobEventMessage(event));
    }
  } else {
    const snapshot = await getSessionSnapshot(sessionId);
    send(toSessionSnapshotEvent(snapshot));

    if (sendJobSnapshot) {
      for (const job of snapshot.jobs) {
        send(toJobSnapshotEvent(job));
      }
    }
  }

  const unsubscribe = subscribeToSession(sessionId, (event) => {
    if (cleanedUp) {
      return;
    }

    try {
      send(toJobEventMessage(event));
    } catch {
      cleanup(unsubscribe);
    }
  });

  return () => cleanup(unsubscribe);
}
