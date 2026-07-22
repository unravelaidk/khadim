import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { callCorePlugin, inspectCorePlugin } from "../../../src/main/plugins/core-runtime";
import { ClaudeCodeServerManager } from "../../../src/main/plugins/claude-code-server-manager";
import { PluginHarnessRunner } from "../../../src/main/plugins/harness-runner";
import type { PluginManager } from "../../../src/main/plugins/plugin-manager";
import type { AgentStreamEvent } from "../../../src/shared/types";
import { updateToolCalls } from "../../../src/shared/agent-event-reducer";
import type { PluginHarnessEventResult } from "../../../src/shared/plugins";

const modulePath = resolve(process.cwd(), "plugins/builtin/claude-code/claude-code.wasm");
const managers: ClaudeCodeServerManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.stopAll()));
});

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  const stdin = new PassThrough();
  Object.assign(child, {
    pid: 42,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin,
    stdio: [stdin, null, null, null, null],
    connected: false,
    killed: false,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: "/fake/claude",
    kill: vi.fn(() => true),
    send: vi.fn(() => false),
    disconnect: vi.fn(),
    ref: vi.fn(),
    unref: vi.fn(),
  });
  return child;
}

function actualClaudePluginManager(): PluginManager {
  const store = new Map<string, string>();
  return {
    get: async () => ({ entry: {
      id: "khadim.claude-code",
      name: "Claude Code",
      version: "0.2.0",
      description: "Test",
      enabled: true,
      bundled: true,
      capabilities: ["harness"],
      harnesses: [{ id: "plugin:khadim.claude-code/claude-code", pluginId: "khadim.claude-code", capabilityId: "claude-code", name: "Claude Code", description: "Test" }],
      permissions: { network: { allowedHosts: ["127.0.0.1", "localhost", "::1"], allowHttp: true } },
      config: [],
    } }),
    configuration: async () => ({ binaryPath: "/fake/claude", permissionMode: "acceptEdits" }),
    storeGet: async (_pluginId: string, key: string) => store.get(key),
    storeSet: async (_pluginId: string, key: string, value: string) => { store.set(key, value); },
    call: async <T>(_pluginId: string, operation: string, input: unknown) => callCorePlugin<T>(modulePath, operation, input),
  } as unknown as PluginManager;
}

describe("bundled Claude Code WebAssembly plugin", () => {
  it("loads through the production ABI and exposes its harness", async () => {
    await expect(inspectCorePlugin(modulePath)).resolves.toEqual({
      info: { id: "khadim.claude-code", name: "Claude Code", version: "0.2.0", apiVersion: 1 },
      capabilities: {
        harnesses: [{
          id: "claude-code",
          name: "Claude Code",
          description: "Use the local Claude Code CLI as the agent harness.",
          icon: "claude",
        }],
      },
    });
  });

  it("builds authenticated bridge requests and model-aware prompts", async () => {
    const context = {
      harnessId: "claude-code",
      projectPath: "/workspace/project",
      engineSessionKey: "chat-one",
      remoteSessionId: "11111111-1111-4111-8111-111111111111",
      prompt: "Say hello",
      systemPrompt: "Be concise.",
      model: { provider: "anthropic", model: "claude-sonnet-4-6" },
      mode: "plan",
      config: {
        bridgeUrl: "http://127.0.0.1:43123",
        bridgeToken: "secret-token",
      },
    };

    await expect(callCorePlugin(modulePath, "harness.endpoint", context)).resolves.toEqual({
      baseUrl: "http://127.0.0.1:43123",
      headers: { authorization: "Bearer secret-token" },
    });
    await expect(callCorePlugin(modulePath, "harness.prompt", context)).resolves.toEqual({
      method: "POST",
      path: "/session/11111111-1111-4111-8111-111111111111/prompt",
      body: { prompt: "Say hello", systemPrompt: "Be concise.", model: "claude-sonnet-4-6", mode: "plan" },
    });
    await expect(callCorePlugin(modulePath, "harness.question.reply", {
      ...context,
      questionRequestId: "question/one",
      questionAnswers: { "Which one?": ["First"] },
    })).resolves.toEqual({
      method: "POST",
      path: "/session/11111111-1111-4111-8111-111111111111/question/question%2Fone/reply",
      body: { answers: { "Which one?": ["First"] } },
    });
  });

  it("maps partial text, tools, usage, completion, and process failures", async () => {
    const base = { remoteSessionId: "session-one" };
    await expect(callCorePlugin(modulePath, "harness.event", {
      ...base,
      event: {
        type: "stream_event",
        session_id: "session-one",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
      },
    })).resolves.toEqual({ events: [{ event_type: "text_delta", content: "Hello" }] });

    await expect(callCorePlugin(modulePath, "harness.event", {
      ...base,
      event: {
        type: "stream_event",
        session_id: "session-one",
        event: { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tool-one", name: "Read", input: {} } },
      },
    })).resolves.toEqual({ events: [{
      event_type: "step_start",
      content: "Read",
      metadata: { id: "tool-one", tool: "Read", title: "Read", input: {} },
    }] });

    await expect(callCorePlugin(modulePath, "harness.event", {
      ...base,
      event: {
        type: "user",
        session_id: "session-one",
        message: { content: [{ type: "tool_result", tool_use_id: "tool-one", content: "file contents", is_error: false }] },
      },
    })).resolves.toEqual({ events: [{
      event_type: "step_complete",
      content: "file contents",
      metadata: { id: "tool-one", result: "file contents", is_error: false },
    }] });

    await expect(callCorePlugin(modulePath, "harness.event", {
      ...base,
      event: {
        type: "result",
        subtype: "success",
        session_id: "session-one",
        usage: { input_tokens: 12, output_tokens: 4, cache_read_input_tokens: 8, cache_creation_input_tokens: 2 },
      },
    })).resolves.toEqual({
      events: [
        { event_type: "usage", metadata: { input: 12, output: 4, cache_read: 8, cache_write: 2 } },
        { event_type: "done", content: "Run completed." },
      ],
      terminal: true,
    });

    await expect(callCorePlugin(modulePath, "harness.event", {
      ...base,
      event: {
        type: "khadim.question",
        session_id: "session-one",
        request_id: "request-one",
        questions: [{
          header: "Choice",
          question: "Which one?",
          options: [{ label: "First", description: "Use the first" }],
          multiSelect: false,
        }],
      },
    })).resolves.toEqual({ events: [{
      event_type: "question",
      metadata: {
        requestId: "request-one",
        questions: [{
          id: "Which one?",
          header: "Choice",
          question: "Which one?",
          options: [{ label: "First", description: "Use the first" }],
          multiSelect: false,
        }],
      },
    }] });

    await expect(callCorePlugin(modulePath, "harness.event", {
      ...base,
      event: { type: "khadim.process_error", message: "Claude failed" },
    })).resolves.toEqual({
      events: [{ event_type: "error", content: "Claude failed" }],
      terminal: true,
    });
  });

  it("preserves the original Claude tool identity when its result completes", async () => {
    const context = { remoteSessionId: "session-one" };
    const started = await callCorePlugin<PluginHarnessEventResult>(modulePath, "harness.event", {
      ...context,
      event: {
        type: "stream_event",
        session_id: "session-one",
        event: { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tool-one", name: "Read", input: { file_path: "README.md" } } },
      },
    });
    const completed = await callCorePlugin<PluginHarnessEventResult>(modulePath, "harness.event", {
      ...context,
      event: {
        type: "user",
        session_id: "session-one",
        message: { content: [{ type: "tool_result", tool_use_id: "tool-one", content: "contents", is_error: false }] },
      },
    });

    const running = updateToolCalls([], started.events[0]);
    expect(updateToolCalls(running, completed.events[0])).toEqual([
      expect.objectContaining({ id: "tool-one", tool: "Read", title: "Read", result: "contents", status: "complete" }),
    ]);
  });

  it("runs end to end through the managed Claude CLI bridge", async () => {
    const spawnProcess = vi.fn((_command: string, args: ReadonlyArray<string>, _options: SpawnOptions) => {
      const child = fakeChild();
      const sessionId = args[args.indexOf("--session-id") + 1];
      queueMicrotask(() => {
        child.stdout?.emit("data", Buffer.from(`${JSON.stringify({
          type: "stream_event",
          session_id: sessionId,
          event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello from Claude" } },
        })}\n`));
        child.stdout?.emit("data", Buffer.from(`${JSON.stringify({
          type: "result",
          subtype: "success",
          session_id: sessionId,
          usage: { input_tokens: 7, output_tokens: 3 },
        })}\n`));
        child.stdout?.emit("end");
        child.emit("close", 0, null);
      });
      return child;
    });
    const manager = new ClaudeCodeServerManager({ spawnProcess, terminate: async () => undefined });
    managers.push(manager);
    const events: AgentStreamEvent[] = [];
    const runner = new PluginHarnessRunner(actualClaudePluginManager(), manager);

    const run = runner.start({
      harnessId: "plugin:khadim.claude-code/claude-code",
      projectPath: "/workspace/project",
      engineSessionKey: "chat-one",
      prompt: "Say hello",
      systemPrompt: "Be concise.",
      model: { provider: "anthropic", model: "claude-sonnet-4-6" },
    }, (event) => events.push(event));
    await run.closed;

    expect(events).toEqual([
      { event_type: "text_delta", content: "Hello from Claude" },
      { event_type: "usage", metadata: { input: 7, output: 3, cache_read: 0, cache_write: 0 } },
      { event_type: "done", content: "Run completed." },
    ]);
    expect(spawnProcess).toHaveBeenCalledWith(
      "/fake/claude",
      expect.arrayContaining(["--model", "claude-sonnet-4-6", "--append-system-prompt-file", expect.stringContaining("system-prompt.txt")]),
      expect.objectContaining({ cwd: "/workspace/project" }),
    );
    expect(spawnProcess.mock.calls[0]?.[1]).not.toContain("Say hello");
    expect(spawnProcess.mock.calls[0]?.[1]).not.toContain("Be concise.");
  });

  it("turns a missing Claude executable into an actionable run error", async () => {
    const spawnProcess = vi.fn(() => {
      const child = fakeChild();
      queueMicrotask(() => {
        child.emit("error", Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" }));
        child.emit("close", -2, null);
      });
      return child;
    });
    const manager = new ClaudeCodeServerManager({ spawnProcess, terminate: async () => undefined });
    managers.push(manager);
    const events: AgentStreamEvent[] = [];
    const runner = new PluginHarnessRunner(actualClaudePluginManager(), manager);

    const run = runner.start({
      harnessId: "plugin:khadim.claude-code/claude-code",
      projectPath: "/workspace/project",
      engineSessionKey: "chat-missing-cli",
      prompt: "Say hello",
      model: { provider: "anthropic", model: "claude-sonnet-4-6" },
    }, (event) => events.push(event));
    await run.closed;

    expect(events).toEqual([{
      event_type: "error",
      content: expect.stringMatching(/Install Claude Code.*claude auth login/),
    }]);
  });

  it("interrupts the Claude process when the user stops a run", async () => {
    let resolveSpawned!: (child: ChildProcess) => void;
    const spawned = new Promise<ChildProcess>((resolve) => { resolveSpawned = resolve; });
    const spawnProcess = vi.fn(() => {
      const child = fakeChild();
      resolveSpawned(child);
      return child;
    });
    const terminate = vi.fn(async (child: ChildProcess) => {
      child.emit("close", null, "SIGTERM");
    });
    const manager = new ClaudeCodeServerManager({ spawnProcess, terminate });
    managers.push(manager);
    const events: AgentStreamEvent[] = [];
    const runner = new PluginHarnessRunner(actualClaudePluginManager(), manager);

    const run = runner.start({
      harnessId: "plugin:khadim.claude-code/claude-code",
      projectPath: "/workspace/project",
      engineSessionKey: "chat-abort",
      prompt: "Keep working",
      model: { provider: "anthropic", model: "claude-sonnet-4-6" },
    }, (event) => events.push(event));
    const child = await spawned;
    await run.abort();

    expect(terminate).toHaveBeenCalledWith(child);
    expect(events).toEqual([{
      event_type: "error",
      content: "Run stopped.",
      metadata: { reason: "aborted" },
    }]);
  });
});
