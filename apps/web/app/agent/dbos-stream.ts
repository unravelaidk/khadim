/**
 * In-memory event bus for real-time WebSocket delivery.
 *
 * DBOS handles durability (checkpointing, crash recovery, queueing).
 * This bus handles real-time delivery to connected WebSocket clients.
 * They don't compete — DBOS persists, the bus streams live.
 */

import { EventEmitter } from "node:events";

export interface SessionEvent {
  type: string;
  data: Record<string, unknown>;
  jobId: string;
  chatId: string;
  sessionId: string;
  sequence?: number;
}

class SessionEventBus {
  private emitter = new EventEmitter();

  emit(jobId: string, sessionId: string, event: SessionEvent): void {
    this.emitter.emit(`job:${jobId}`, event);
    this.emitter.emit(`session:${sessionId}`, event);
  }

  onJob(jobId: string, handler: (event: SessionEvent) => void): () => void {
    const eventName = `job:${jobId}`;
    this.emitter.on(eventName, handler);
    return () => this.emitter.off(eventName, handler);
  }

  onSession(sessionId: string, handler: (event: SessionEvent) => void): () => void {
    const eventName = `session:${sessionId}`;
    this.emitter.on(eventName, handler);
    return () => this.emitter.off(eventName, handler);
  }

  /** Clear all listeners (useful in tests) */
  reset(): void {
    this.emitter.removeAllListeners();
  }
}

export const sessionEventBus = new SessionEventBus();
