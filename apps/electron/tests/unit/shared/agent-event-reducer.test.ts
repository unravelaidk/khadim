import { describe, expect, it } from "vitest";
import { applySequencedAgentEvent, conversationUsage, processedTokenTotal, updateCoordination } from "../../../src/shared/agent-event-reducer";
import type { Conversation } from "../../../src/shared/types";

describe("multi-agent event reduction", () => {
  it("does not create team state from ordinary single-agent goal events", () => {
    expect(updateCoordination(undefined, {
      event_type: "goal_heuristic",
      metadata: { goals: [{ kind: "General", description: "Answer the question" }] },
    })).toBeUndefined();
  });

  it("does not create team state from ordinary harness tools", () => {
    expect(updateCoordination(undefined, {
      event_type: "step_start",
      content: JSON.stringify({ path: "src/App.tsx" }),
      metadata: { id: "read-1", tool: "read", title: "Read App.tsx" },
    })).toBeUndefined();
  });

  it.each([
    ["Claude Code", {
      event_type: "step_start",
      metadata: {
        id: "claude-agent-1",
        tool: "Agent",
        input: { subagent_type: "Explore", prompt: "Inspect the renderer" },
      },
    }, "Explore", "Inspect the renderer"],
    ["OpenCode", {
      event_type: "step_start",
      content: JSON.stringify({ subagent_type: "general", description: "Review events", prompt: "Review event handling" }),
      metadata: { id: "opencode-task-1", tool: "task", title: "Review events" },
    }, "general", "Review events"],
    ["Codex", {
      event_type: "step_start",
      content: JSON.stringify({ type: "collabToolCall", id: "codex-collab-1", tool: "spawn_agent", prompt: "Check the tests" }),
      metadata: { id: "codex-collab-1", tool: "Tool", title: "Tool" },
    }, undefined, "Check the tests"],
    ["Cursor", {
      event_type: "step_start",
      content: JSON.stringify({
        sessionUpdate: "tool_call",
        toolCallId: "cursor-task-1",
        title: "Task",
        rawInput: { subagentType: "explore", description: "Map the codebase", prompt: "Find the relevant files" },
      }),
      metadata: { id: "cursor-task-1", tool: "Task", title: "Task" },
    }, "explore", "Map the codebase"],
    ["Grok ACP", {
      event_type: "step_start",
      content: JSON.stringify({
        sessionUpdate: "tool_call",
        toolCallId: "grok-task-1",
        title: "subagent",
        rawInput: { role: "review", task: "Audit the implementation" },
      }),
      metadata: { id: "grok-task-1", tool: "subagent", title: "subagent" },
    }, "review", "Audit the implementation"],
  ])("normalizes real %s subagent calls", (_harness, event, mode, task) => {
    const state = updateCoordination(undefined, event);
    expect(state).toMatchObject({
      status: "running",
      workers: [{ mode, task, status: "running" }],
    });

    const completed = updateCoordination(state, {
      event_type: "step_complete",
      metadata: { id: state?.workers[0]?.id.replace(/^harness:/, "") },
    });
    expect(completed?.workers[0]?.status).toBe("complete");
  });

  it("builds durable plan and helper progress for an explicit team run", () => {
    let state = updateCoordination(undefined, {
      event_type: "team_started",
      metadata: { max_helpers: 3 },
    });
    state = updateCoordination(state, {
      event_type: "goal_heuristic",
      metadata: {
        total_goals: 2,
        goals: [
          { kind: "Modify", description: "Update the composer", target_files: ["Composer.tsx"], deps: [] },
          { kind: "Verify", description: "Run the tests", target_files: [], deps: [0] },
        ],
      },
    });
    state = updateCoordination(state, {
      event_type: "worker_spawned",
      content: "Inspect the composer behavior",
      metadata: {
        worker_id: "delegate-explore-123",
        mode: "Explore",
        model: "gpt-5.4",
        model_name: "GPT 5.4",
        provider: "openai",
        context_window: 400_000,
      },
    }, "2026-08-01T00:00:01.000Z");
    state = updateCoordination(state, {
      event_type: "worker_event",
      metadata: {
        worker_id: "delegate-explore-123",
        inner_event_type: "usage",
        inner_metadata: { input: 12_000, output: 900, cache_read: 4_000, cache_write: 0 },
      },
    }, "2026-08-01T00:00:02.000Z");
    state = updateCoordination(state, {
      event_type: "goal_satisfied",
      metadata: { goal_index: 0, description: "Update the composer" },
    });
    state = updateCoordination(state, {
      event_type: "worker_done",
      content: "Found the relevant component",
      metadata: { worker_id: "delegate-explore-123" },
    });
    state = updateCoordination(state, {
      event_type: "done",
      content: "Finished",
    });

    expect(state?.status).toBe("complete");
    expect(state?.goals).toMatchObject([
      { id: 0, status: "complete" },
      { id: 1, status: "pending" },
    ]);
    expect(state?.workers).toMatchObject([
      {
        id: "delegate-explore-123",
        mode: "Explore",
        model: "gpt-5.4",
        modelName: "GPT 5.4",
        provider: "openai",
        contextWindow: 400_000,
        usage: { input: 12_000, output: 900, cacheRead: 4_000, cacheWrite: 0 },
        status: "complete",
      },
    ]);
  });

  it("finishes the assistant message when a Team run receives done", () => {
    const conversation = {
      id: "conversation-1",
      projectId: "project-1",
      engineSessionKey: "engine-1",
      title: "Team run",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      messages: [{
        id: "assistant-1",
        role: "assistant",
        content: "Finished",
        createdAt: "2026-08-01T00:00:00.000Z",
        status: "streaming",
        coordination: { status: "running", goals: [], workers: [] },
      }],
      runs: [{
        id: "run-1",
        projectId: "project-1",
        conversationId: "conversation-1",
        userMessageId: "user-1",
        assistantMessageId: "assistant-1",
        status: "running",
        createdAt: "2026-08-01T00:00:00.000Z",
        agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
        model: { id: "model-1", name: "Model", provider: "anthropic", model: "model-id" },
        harness: "assistant",
        enabledTools: [],
      }],
    } satisfies Conversation;

    const updated = applySequencedAgentEvent(
      conversation,
      "run-1",
      "assistant-1",
      1,
      { event_type: "done" },
      new Map(),
    );
    expect(updated.messages[0]).toMatchObject({ status: "complete", coordination: { status: "complete" } });
  });
});

describe("token usage reduction", () => {
  const conversation = (): Conversation => ({
    id: "conversation-usage",
    projectId: "project-1",
    engineSessionKey: "engine-usage",
    title: "Usage",
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
    messages: [{
      id: "assistant-usage",
      role: "assistant",
      content: "",
      createdAt: "2026-08-06T00:00:00.000Z",
      status: "streaming",
    }],
    runs: [{
      id: "run-usage",
      projectId: "project-1",
      conversationId: "conversation-usage",
      userMessageId: "user-usage",
      assistantMessageId: "assistant-usage",
      status: "running",
      createdAt: "2026-08-06T00:00:00.000Z",
      agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
      model: { id: "model-1", name: "Model", provider: "openai", model: "model-id" },
      harness: "assistant",
      enabledTools: [],
    }],
  });

  it("keeps the latest context snapshot instead of accumulating it", () => {
    const usageState = new Map();
    const first = applySequencedAgentEvent(
      conversation(),
      "run-usage",
      "assistant-usage",
      1,
      { event_type: "usage", metadata: { context_used: 53_000, context_size: 200_000 } },
      usageState,
    );
    const second = applySequencedAgentEvent(
      first,
      "run-usage",
      "assistant-usage",
      2,
      { event_type: "usage", metadata: { context_used: 54_000, context_size: 200_000 } },
      usageState,
    );

    expect(conversationUsage(second)).toMatchObject({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      contextUsed: 54_000,
      contextSize: 200_000,
    });
  });

  it("counts mutually exclusive cache buckets once", () => {
    expect(processedTokenTotal({ input: 49_800, output: 895, cacheRead: 0, cacheWrite: 0 })).toBe(50_695);
    expect(processedTokenTotal({ input: 10_000, output: 2_000, cacheRead: 8_000, cacheWrite: 1_000 })).toBe(21_000);
  });

  it("does not add a provider aggregate to categorized buckets", () => {
    expect(processedTokenTotal({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalProcessed: 75_000,
    })).toBe(75_000);
  });
});
