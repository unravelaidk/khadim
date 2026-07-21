import type {
  AgentRunIdentity,
  AgentRunRecoverySnapshot,
  AgentStreamEvent,
  SequencedAgentStreamEvent,
} from "../shared/types";

interface BufferedRun extends AgentRunIdentity {
  events: SequencedAgentStreamEvent[];
  eventBytes: number[];
  byteSize: number;
  terminal: boolean;
  droppedEventCount: number;
  nextSequence: number;
}

export interface RunEventBufferOptions {
  maxEventsPerRun?: number;
  maxBytesPerRun?: number;
  maxBytesPerEvent?: number;
}

const DEFAULT_MAX_EVENTS_PER_RUN = 5_000;
const DEFAULT_MAX_BYTES_PER_RUN = 16 * 1024 * 1024;
const DEFAULT_MAX_BYTES_PER_EVENT = 512 * 1024;

function eventByteSize(event: AgentStreamEvent): number {
  return Buffer.byteLength(JSON.stringify(event), "utf8");
}

function boundedEvent(event: AgentStreamEvent, maximumBytes: number): AgentStreamEvent {
  if (eventByteSize(event) <= maximumBytes) return structuredClone(event);
  const metadata: Record<string, unknown> = { buffer_truncated: true };
  const sourceMetadata = event.metadata ?? {};
  for (const key of ["id", "tool", "title", "kind", "is_error", "reason", "input", "output", "cache_read", "cache_write"]) {
    const value = sourceMetadata[key];
    if (typeof value === "number" || typeof value === "boolean") metadata[key] = value;
    else if (typeof value === "string" && value.length <= 1_000) metadata[key] = value;
  }
  const contentLimit = Math.max(0, Math.floor(maximumBytes / 4));
  const content = typeof event.content === "string"
    ? `${event.content.slice(0, contentLimit)}\n… [recovery buffer truncated this event]`
    : event.content;
  const candidate: AgentStreamEvent = {
    event_type: event.event_type,
    ...(event.workspace_id === undefined ? {} : { workspace_id: event.workspace_id }),
    ...(event.session_id === undefined ? {} : { session_id: event.session_id }),
    ...(content === undefined ? {} : { content }),
    metadata,
  };
  // The conservative character limit above normally fits even for four-byte
  // UTF-8. Keep a tiny typed marker as a final bound for unusual metadata.
  return eventByteSize(candidate) <= maximumBytes
    ? candidate
    : {
        event_type: event.event_type === "done" || event.event_type === "error"
          ? event.event_type
          : "buffer_truncated",
        content: "[Recovery event truncated]",
        metadata: sourceMetadata.reason === "aborted"
          ? { buffer_truncated: true, reason: "aborted" }
          : { buffer_truncated: true },
      };
}

/**
 * Main-process replay storage for events that may arrive while the renderer is
 * reloading. Records live until their terminal event has been acknowledged.
 */
export class RunEventBuffer {
  readonly #maxEventsPerRun: number;
  readonly #maxBytesPerRun: number;
  readonly #maxBytesPerEvent: number;
  readonly #runs = new Map<string, BufferedRun>();

  constructor({
    maxEventsPerRun = DEFAULT_MAX_EVENTS_PER_RUN,
    maxBytesPerRun = DEFAULT_MAX_BYTES_PER_RUN,
    maxBytesPerEvent = DEFAULT_MAX_BYTES_PER_EVENT,
  }: RunEventBufferOptions = {}) {
    if (!Number.isSafeInteger(maxEventsPerRun) || maxEventsPerRun < 1) {
      throw new Error("maxEventsPerRun must be a positive integer");
    }
    if (!Number.isSafeInteger(maxBytesPerRun) || maxBytesPerRun < 256) {
      throw new Error("maxBytesPerRun must be an integer of at least 256 bytes");
    }
    if (!Number.isSafeInteger(maxBytesPerEvent) || maxBytesPerEvent < 128 || maxBytesPerEvent > maxBytesPerRun) {
      throw new Error("maxBytesPerEvent must be between 128 bytes and maxBytesPerRun");
    }
    this.#maxEventsPerRun = maxEventsPerRun;
    this.#maxBytesPerRun = maxBytesPerRun;
    this.#maxBytesPerEvent = maxBytesPerEvent;
  }

  register(identity: AgentRunIdentity): void {
    if (this.#runs.has(identity.runId)) throw new Error(`Run ${identity.runId} is already buffered`);
    this.#runs.set(identity.runId, {
      ...identity,
      events: [],
      eventBytes: [],
      byteSize: 0,
      terminal: false,
      droppedEventCount: 0,
      nextSequence: 1,
    });
  }

  append(runId: string, event: AgentStreamEvent): number {
    const run = this.#require(runId);
    const sequence = run.nextSequence++;
    const bufferedEvent = boundedEvent(event, this.#maxBytesPerEvent);
    const bytes = eventByteSize(bufferedEvent);
    run.events.push({ sequence, event: bufferedEvent });
    run.eventBytes.push(bytes);
    run.byteSize += bytes;
    while (run.events.length > this.#maxEventsPerRun || run.byteSize > this.#maxBytesPerRun) {
      run.events.shift();
      run.byteSize -= run.eventBytes.shift() ?? 0;
      run.droppedEventCount += 1;
    }
    return sequence;
  }

  markTerminal(runId: string): void {
    this.#require(runId).terminal = true;
  }

  listRecoverable(): AgentRunRecoverySnapshot[] {
    return Array.from(this.#runs.values(), ({ eventBytes: _eventBytes, byteSize: _byteSize, ...run }) => structuredClone(run));
  }

  /** Check a shutdown barrier without cloning retained event payloads. */
  hasAny(runIds: ReadonlySet<string>): boolean {
    for (const runId of runIds) {
      if (this.#runs.has(runId)) return true;
    }
    return false;
  }

  /** Active runs cannot be removed because later events still need a target. */
  acknowledge(runId: string): boolean {
    const run = this.#runs.get(runId);
    if (!run?.terminal) return false;
    return this.#runs.delete(runId);
  }

  #require(runId: string): BufferedRun {
    const run = this.#runs.get(runId);
    if (!run) throw new Error(`Run ${runId} is not buffered`);
    return run;
  }
}
