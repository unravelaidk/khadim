import type { AgentCoordinationActivity, AgentCoordinationGoal, AgentCoordinationWorker, AgentStreamEvent, Conversation, TokenUsage, ToolCallActivity } from "./types";

export const EMPTY_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function updateToolCalls(current: ToolCallActivity[] = [], event: AgentStreamEvent): ToolCallActivity[] {
  if (!event.event_type.startsWith("step_")) return current;
  const metadata = event.metadata ?? {};
  const metadataTool = typeof metadata.tool === "string" && metadata.tool.trim() ? metadata.tool : undefined;
  if (metadataTool === "model") return current;
  const id = typeof metadata.id === "string" && metadata.id.trim() ? metadata.id : `${metadataTool ?? "tool"}-${current.length}`;
  const existingIndex = current.findIndex((activity) => activity.id === id);
  const existing = existingIndex >= 0 ? current[existingIndex] : null;
  const tool = metadataTool ?? existing?.tool ?? "tool";
  const title = typeof metadata.title === "string" && metadata.title.trim()
    ? metadata.title
    : existing?.title ?? (event.content?.trim() || `Running ${tool}`);
  const status = event.event_type === "step_complete"
    ? metadata.is_error === true ? "error" : "complete"
    : "running";
  const next: ToolCallActivity = {
    id,
    tool,
    title,
    input: event.event_type === "step_update" ? event.content ?? existing?.input : existing?.input,
    result: event.event_type === "step_complete" ? (typeof metadata.result === "string" ? metadata.result : event.content ?? "") : existing?.result,
    metadata,
    status,
  };
  if (existingIndex < 0) return [...current, next];
  return current.map((activity, index) => index === existingIndex ? next : activity);
}

const COORDINATION_EVENTS = new Set([
  "team_started", "goal_heuristic", "worker_spawned",
  "worker_event", "worker_done", "worker_failed", "worker_blocked",
  "goal_satisfied", "done", "error",
]);

const HARNESS_SUBAGENT_TOOLS = new Set([
  "agent",
  "task",
  "subagent",
  "agentcrew",
  "spawnagent",
  "runsubagent",
  "createsubagent",
]);

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isInteger(item)) : [];
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim().startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function firstString(records: Array<Record<string, unknown> | undefined>, keys: string[]): string | undefined {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = stringValue(record[key]);
      if (value) return value;
    }
  }
  return undefined;
}

function normalizedTool(value: string | undefined): string {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

interface HarnessWorkerSeed {
  id: string;
  task: string;
  mode?: string;
  model?: string;
  provider?: string;
}

/**
 * Normalize subagent tool calls emitted by plugin harnesses. Claude and
 * OpenCode expose Agent/Task calls, Codex exposes collabToolCall(spawn_agent),
 * and ACP harnesses expose positively named Task/subagent calls. Ordinary tool
 * activity deliberately returns no workers.
 */
function harnessWorkerSeeds(
  current: AgentCoordinationActivity | undefined,
  event: AgentStreamEvent,
): HarnessWorkerSeed[] {
  if (!event.event_type.startsWith("step_")) return [];
  const metadata = event.metadata ?? {};
  const content = recordValue(event.content);
  const input = recordValue(metadata.input)
    ?? recordValue(content?.rawInput)
    ?? recordValue(content?.arguments)
    ?? recordValue(content?.input)
    ?? content;
  const callId = firstString([metadata, content], ["id", "toolCallId", "callID", "tool_use_id"]);
  if (!callId) return [];

  const existing = current?.workers.filter((worker) => (
    worker.id === `harness:${callId}` || worker.id.startsWith(`harness:${callId}:`)
  )) ?? [];
  if (existing.length > 0) {
    return existing.map((worker) => ({
      id: worker.id,
      task: worker.task,
      mode: worker.mode,
      model: worker.model,
      provider: worker.provider,
    }));
  }

  const candidates = [
    firstString([metadata], ["tool", "title"]),
    firstString([content], ["tool", "name", "type", "title"]),
    firstString([input], ["tool", "name", "type"]),
  ].map(normalizedTool).filter(Boolean);
  const collabCall = candidates.includes("collabtoolcall") || candidates.includes("collabagenttoolcall");
  const operation = normalizedTool(firstString([content, input], ["tool", "operation", "action"]));
  const recognized = candidates.some((candidate) => HARNESS_SUBAGENT_TOOLS.has(candidate) || candidate.endsWith("spawnagent"))
    || (collabCall && operation === "spawnagent");
  if (!recognized || (collabCall && operation && operation !== "spawnagent")) return [];

  const rootTask = firstString([input, content, metadata], ["description", "prompt", "task", "objective", "title"])
    ?? "Working on a delegated task";
  const stages = Array.isArray(input?.stages)
    ? input.stages.flatMap((value) => {
        const stage = recordValue(value);
        return stage ? [stage] : [];
      })
    : [];
  if (stages.length > 0) {
    return stages.map((stage, index) => {
      const stageName = firstString([stage], ["name", "id"]) ?? String(index + 1);
      return {
        id: `harness:${callId}:${stageName}`,
        task: firstString([stage], ["description", "prompt", "prompt_template", "task"]) ?? rootTask,
        mode: firstString([stage], ["role", "subagent_type", "agent_type", "agent", "name"]),
        model: firstString([stage, input, content, metadata], ["model", "modelID"]),
        provider: firstString([stage, input, content, metadata], ["provider", "providerID"]),
      };
    });
  }
  return [{
    id: `harness:${callId}`,
    task: rootTask,
    mode: firstString([input, content, metadata], ["subagent_type", "subagentType", "agent_type", "agent", "role"]),
    model: firstString([input, content, metadata], ["model", "modelID"]),
    provider: firstString([input, content, metadata], ["provider", "providerID"]),
  }];
}

function coordinationWorker(
  current: AgentCoordinationWorker[],
  id: string,
  update: Partial<AgentCoordinationWorker>,
): AgentCoordinationWorker[] {
  const existing = current.find((worker) => worker.id === id);
  const next: AgentCoordinationWorker = {
    id,
    task: existing?.task ?? "Preparing subagent",
    goalIds: existing?.goalIds ?? [],
    status: existing?.status ?? "queued",
    ...existing,
    ...update,
  };
  return existing ? current.map((worker) => worker.id === id ? next : worker) : [...current, next];
}

export function updateCoordination(
  current: AgentCoordinationActivity | undefined,
  event: AgentStreamEvent,
  eventAt = new Date().toISOString(),
): AgentCoordinationActivity | undefined {
  if (event.event_type.startsWith("step_")) {
    const seeds = harnessWorkerSeeds(current, event);
    if (seeds.length === 0) return current;
    const base = current ?? { status: "running", goals: [], workers: [], startedAt: eventAt };
    const failed = event.event_type === "step_complete" && event.metadata?.is_error === true;
    const terminal = event.event_type === "step_complete";
    return {
      ...base,
      status: base.status === "planning" ? "running" : base.status,
      workers: seeds.reduce((workers, seed) => coordinationWorker(workers, seed.id, {
        task: seed.task,
        mode: seed.mode,
        model: seed.model,
        provider: seed.provider,
        status: terminal ? failed ? "failed" : "complete" : "running",
        startedAt: workers.find((worker) => worker.id === seed.id)?.startedAt ?? eventAt,
        updatedAt: eventAt,
        ...(terminal ? {
          completedAt: eventAt,
          activity: undefined,
          ...(failed ? { error: stringValue(event.content) ?? "Subagent failed" } : { summary: stringValue(event.metadata?.result) }),
        } : {}),
      }), base.workers),
    };
  }
  if (!COORDINATION_EVENTS.has(event.event_type)) return current;
  if (event.event_type === "team_started") {
    return current ?? { status: "planning", goals: [], workers: [], startedAt: eventAt };
  }
  if (!current && event.event_type !== "worker_spawned") return undefined;
  const next: AgentCoordinationActivity = current ?? { status: "running", goals: [], workers: [], startedAt: eventAt };
  if (event.event_type === "done") return { ...next, status: "complete", completedAt: eventAt };
  if (event.event_type === "error") return { ...next, status: "failed", completedAt: eventAt };
  const metadata = event.metadata ?? {};

  if (event.event_type === "goal_heuristic") {
    const rawGoals = Array.isArray(metadata.goals) ? metadata.goals : [];
    const goals: AgentCoordinationGoal[] = rawGoals.flatMap((value, id) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const goal = value as Record<string, unknown>;
      const description = stringValue(goal.description);
      if (!description) return [];
      return [{
        id,
        kind: stringValue(goal.kind) ?? "Goal",
        description,
        targetFiles: Array.isArray(goal.target_files) ? goal.target_files.filter((item): item is string => typeof item === "string") : [],
        dependencies: numberList(goal.deps),
        status: "pending" as const,
      }];
    });
    return { ...next, status: "planning", goals };
  }

  const workerId = stringValue(metadata.worker_id);
  if (workerId && event.event_type === "worker_spawned") {
    return {
      ...next,
      status: "running",
      workers: coordinationWorker(next.workers, workerId, {
        task: stringValue(metadata.task) ?? stringValue(event.content) ?? "Working on assigned goals",
        mode: stringValue(metadata.mode),
        model: stringValue(metadata.model),
        modelName: stringValue(metadata.model_name),
        provider: stringValue(metadata.provider),
        contextWindow: typeof metadata.context_window === "number" ? metadata.context_window : undefined,
        status: "running",
        startedAt: eventAt,
        updatedAt: eventAt,
      }),
    };
  }
  if (workerId && event.event_type === "worker_event") {
    const innerType = stringValue(metadata.inner_event_type);
    const innerMetadata = metadata.inner_metadata && typeof metadata.inner_metadata === "object" && !Array.isArray(metadata.inner_metadata)
      ? metadata.inner_metadata as Record<string, unknown>
      : {};
    const activity = stringValue(innerMetadata.title)
      ?? stringValue(metadata.inner_content)
      ?? (innerType === "text_delta" ? "Writing response" : innerType?.replaceAll("_", " "));
    const usage = innerType === "usage" ? {
      input: typeof innerMetadata.input === "number" ? innerMetadata.input : 0,
      output: typeof innerMetadata.output === "number" ? innerMetadata.output : 0,
      cacheRead: typeof innerMetadata.cache_read === "number" ? innerMetadata.cache_read : 0,
      cacheWrite: typeof innerMetadata.cache_write === "number" ? innerMetadata.cache_write : 0,
    } : undefined;
    return {
      ...next,
      workers: coordinationWorker(next.workers, workerId, {
        status: "running",
        updatedAt: eventAt,
        ...(activity ? { activity } : {}),
        ...(usage ? { usage } : {}),
      }),
    };
  }
  if (workerId && event.event_type === "worker_done") {
    return { ...next, workers: coordinationWorker(next.workers, workerId, { status: "complete", summary: stringValue(metadata.summary) ?? stringValue(event.content), activity: undefined, updatedAt: eventAt, completedAt: eventAt }) };
  }
  if (workerId && event.event_type === "worker_failed") {
    return { ...next, workers: coordinationWorker(next.workers, workerId, { status: "failed", error: stringValue(metadata.error) ?? stringValue(event.content), activity: undefined, updatedAt: eventAt, completedAt: eventAt }) };
  }
  if (workerId && event.event_type === "worker_blocked") {
    return { ...next, workers: coordinationWorker(next.workers, workerId, { status: "blocked", error: stringValue(metadata.reason), activity: undefined, updatedAt: eventAt, completedAt: eventAt }) };
  }
  if (event.event_type === "goal_satisfied") {
    const goalId = typeof metadata.goal_index === "number"
      ? metadata.goal_index
      : typeof metadata.goal_id === "number" ? metadata.goal_id : -1;
    return { ...next, goals: next.goals.map((goal) => goal.id === goalId ? { ...goal, status: "complete" } : goal) };
  }
  return next;
}

export function usageFromEvent(event: AgentStreamEvent): TokenUsage {
  const number = (key: string) => typeof event.metadata?.[key] === "number" ? event.metadata[key] as number : 0;
  const optionalNumber = (key: string) => typeof event.metadata?.[key] === "number" ? event.metadata[key] as number : undefined;
  return {
    input: number("input"),
    output: number("output"),
    cacheRead: number("cache_read"),
    cacheWrite: number("cache_write"),
    contextUsed: optionalNumber("context_used"),
    contextSize: optionalNumber("context_size"),
    totalProcessed: optionalNumber("total_processed"),
  };
}

export function addUsage(left: TokenUsage = EMPTY_USAGE, right: TokenUsage): TokenUsage {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
    contextUsed: right.contextUsed ?? left.contextUsed,
    contextSize: right.contextSize ?? left.contextSize,
    totalProcessed: right.totalProcessed ?? left.totalProcessed,
  };
}

/**
 * TokenUsage buckets are mutually exclusive. Some harnesses only expose a
 * provider-computed lifetime total, so prefer whichever complete view is
 * larger instead of adding that aggregate to the categorized buckets.
 */
export function processedTokenTotal(usage: TokenUsage): number {
  const categorized = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  return Math.max(categorized, usage.totalProcessed ?? 0);
}

export function conversationUsage(conversation: Conversation | null): TokenUsage {
  return conversation?.messages.reduce((total, message) => addUsage(total, message.usage ?? EMPTY_USAGE), EMPTY_USAGE) ?? EMPTY_USAGE;
}

/**
 * Repair the durable cross-record invariant after a terminal event was saved
 * only partially. This can happen when the run record reaches disk before its
 * assistant message and the replayed terminal sequence is therefore a
 * duplicate. Returning a new conversation makes callers persist before ACK.
 */
export function reconcileTerminalAssistant(
  conversation: Conversation,
  runId: string,
  assistantMessageId: string,
  eventAt = new Date().toISOString(),
): Conversation {
  const run = conversation.runs?.find((candidate) => candidate.id === runId);
  if (!run || run.status === "running") return conversation;
  const assistantIndex = conversation.messages.findIndex((message) => (
    message.id === assistantMessageId && message.role === "assistant" && message.status === "streaming"
  ));
  if (assistantIndex < 0) return conversation;
  const messages = [...conversation.messages];
  const assistant = messages[assistantIndex];
  const complete = run.status === "complete";
  messages[assistantIndex] = {
    ...assistant,
    status: complete ? "complete" : "error",
    content: assistant.content || (complete ? "" : "The run ended before its final message could be saved."),
  };
  return { ...conversation, messages, updatedAt: eventAt };
}

function applyAgentEvent(
  conversation: Conversation,
  assistantMessageId: string,
  event: AgentStreamEvent,
  usageDelta: TokenUsage | null,
  eventAt: string,
): Conversation {
  const assistantIndex = conversation.messages.findIndex((message) => message.id === assistantMessageId && message.role === "assistant");
  if (assistantIndex < 0) return conversation;
  const messages = [...conversation.messages];
  const assistant = messages[assistantIndex];
  const coordination = updateCoordination(assistant.coordination, event, eventAt);
  if (coordination !== assistant.coordination) {
    const coordinated = {
      ...assistant,
      coordination,
      ...(event.event_type.startsWith("step_")
        ? { toolCalls: updateToolCalls(assistant.toolCalls, event) }
        : {}),
    };
    messages[assistantIndex] = event.event_type === "done"
      ? { ...coordinated, status: "complete" }
      : event.event_type === "error"
        ? {
            ...coordinated,
            content: assistant.content || event.content || "Something went wrong while running Khadim.",
            status: "error",
          }
        : coordinated;
  } else if (event.event_type.startsWith("step_")) {
    messages[assistantIndex] = { ...assistant, toolCalls: updateToolCalls(assistant.toolCalls, event) };
  } else if (usageDelta) {
    messages[assistantIndex] = { ...assistant, usage: addUsage(assistant.usage, usageDelta) };
  } else if (event.event_type === "text_delta" && event.content) {
    messages[assistantIndex] = { ...assistant, content: assistant.content + event.content };
  } else if (event.event_type === "done") {
    messages[assistantIndex] = { ...assistant, status: "complete" };
  } else if (event.event_type === "error") {
    messages[assistantIndex] = {
      ...assistant,
      content: assistant.content || event.content || "Something went wrong while running Khadim.",
      status: "error",
    };
  } else {
    return conversation;
  }
  return { ...conversation, messages, updatedAt: eventAt };
}

/**
 * Applies one ordered engine event to its durable conversation snapshot.
 * Usage events contain cumulative snapshots for the current LLM call, so the
 * supplied state tracks the last snapshot and only adds its positive delta.
 */
export function applySequencedAgentEvent(
  conversation: Conversation,
  runId: string,
  assistantMessageId: string,
  sequence: number,
  event: AgentStreamEvent,
  usageState: Map<string, TokenUsage>,
  eventAt = new Date().toISOString(),
): Conversation {
  const run = conversation.runs?.find((candidate) => candidate.id === runId);
  if (!run) return conversation;
  if (event.event_type === "llm_call_start") usageState.set(runId, EMPTY_USAGE);
  const usageDelta = event.event_type === "usage" ? (() => {
    const snapshot = usageFromEvent(event);
    const previous = usageState.get(runId) ?? EMPTY_USAGE;
    usageState.set(runId, snapshot);
    return {
      input: Math.max(0, snapshot.input - previous.input),
      output: Math.max(0, snapshot.output - previous.output),
      cacheRead: Math.max(0, snapshot.cacheRead - previous.cacheRead),
      cacheWrite: Math.max(0, snapshot.cacheWrite - previous.cacheWrite),
      contextUsed: snapshot.contextUsed,
      contextSize: snapshot.contextSize,
      totalProcessed: snapshot.totalProcessed,
    };
  })() : null;
  // Replayed usage snapshots still advance the per-call baseline even when the
  // conversation already contains that sequence. This prevents a later live
  // snapshot from counting the same tokens twice.
  if (sequence <= (run.lastEventSequence ?? 0)) return conversation;
  const updated = applyAgentEvent(conversation, assistantMessageId, event, usageDelta, eventAt);
  const terminal = event.event_type === "done" || event.event_type === "error";
  const stopped = event.event_type === "error" && event.metadata?.reason === "aborted";
  return {
    ...updated,
    runs: updated.runs?.map((candidate) => candidate.id === runId ? {
      ...candidate,
      lastEventSequence: sequence,
      ...(terminal ? {
        status: event.event_type === "done" ? "complete" as const : stopped ? "stopped" as const : "error" as const,
        completedAt: eventAt,
      } : {}),
    } : candidate),
  };
}
