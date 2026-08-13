import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CliHarnessServerManager } from "../../../src/main/plugins/cli-harness-server-manager";

const managers: CliHarnessServerManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.stopAll()));
});

function fakeChild(onMessage: (message: Record<string, unknown>, child: ChildProcess) => void): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  let buffer = "";
  stdin.on("data", (chunk: Buffer | string) => {
    buffer += chunk.toString();
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim()) onMessage(JSON.parse(line) as Record<string, unknown>, child);
      newline = buffer.indexOf("\n");
    }
  });
  Object.assign(child, {
    pid: 42,
    stdin,
    stdout,
    stderr: new PassThrough(),
    stdio: [stdin, stdout, null, null, null],
    connected: false,
    killed: false,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: "/fake/codex",
    kill: vi.fn(() => true),
    send: vi.fn(() => false),
    disconnect: vi.fn(),
    ref: vi.fn(),
    unref: vi.fn(),
  });
  return child;
}

describe("CliHarnessServerManager", () => {
  it("bridges Codex requestUserInput and returns structured answers", async () => {
    let questionResponse: Record<string, unknown> | undefined;
    let turnStart: Record<string, unknown> | undefined;
    const spawnProcess = vi.fn(() => fakeChild((message, child) => {
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "thread/start") write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "thread-one" } } });
      if (message.method === "turn/start") {
        turnStart = message;
        write({ jsonrpc: "2.0", id: message.id, result: { turn: { id: "turn-one" } } });
        write({
          jsonrpc: "2.0",
          id: 99,
          method: "item/tool/requestUserInput",
          params: {
            questions: [{
              id: "delivery",
              header: "Delivery",
              question: "When should this ship?",
              options: [{ label: "Now", description: "Ship immediately" }],
            }],
          },
        });
      }
      if (message.id === 99 && message.result) {
        questionResponse = message;
        write({ jsonrpc: "2.0", method: "turn/completed", params: { threadId: "thread-one", turn: { id: "turn-one", status: "completed" } } });
      }
    }));
    const manager = new CliHarnessServerManager({
      spawnProcess,
      resolveBinary: () => "/fake/codex",
      terminate: async (child) => { child.emit("close", 0, null); },
    });
    managers.push(manager);
    const config = await manager.prepare({
      pluginId: "khadim.codex",
      bundled: true,
      engineSessionKey: "chat-one",
      projectPath: "/workspace/project",
      config: { binaryPath: "codex" },
      nativeToolMcp: { url: "http://127.0.0.1:45555/mcp", token: "run-secret", hasTools: true },
    });
    const headers = { authorization: `Bearer ${config.bridgeToken}`, "content-type": "application/json" };
    const created = await fetch(`${config.bridgeUrl}/session`, { method: "POST", headers });
    const { id } = await created.json() as { id: string };
    const eventsResponse = await fetch(`${config.bridgeUrl}/session/${id}/events`, { headers });
    await fetch(`${config.bridgeUrl}/session/${id}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: "Prepare release", model: "gpt-5.6-sol", mode: "plan" }),
    });

    const reader = eventsResponse.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    const question = JSON.parse(first.match(/data: (.+)/)?.[1] ?? "{}") as { request_id: string };
    const answered = await fetch(`${config.bridgeUrl}/session/${id}/question/${question.request_id}/reply`, {
      method: "POST",
      headers,
      body: JSON.stringify({ answers: { delivery: ["Now"] } }),
    });
    expect(answered.status).toBe(200);
    await reader.read();

    expect(questionResponse).toEqual({
      jsonrpc: "2.0",
      id: 99,
      result: { answers: { delivery: { answers: ["Now"] } } },
    });
    expect(turnStart).toEqual(expect.objectContaining({
      params: expect.objectContaining({
        model: "gpt-5.6-sol",
        collaborationMode: expect.objectContaining({ mode: "plan" }),
      }),
    }));
    expect(spawnProcess).toHaveBeenCalledWith(
      "/fake/codex",
      [
        "app-server",
        "-c", "mcp_servers.khadim.url=\"http://127.0.0.1:45555/mcp\"",
        "-c", "mcp_servers.khadim.bearer_token_env_var=\"KHADIM_NATIVE_MCP_TOKEN\"",
        "-c", "mcp_servers.khadim.required=true",
      ],
      expect.objectContaining({
        cwd: "/workspace/project",
        env: expect.objectContaining({ KHADIM_NATIVE_MCP_TOKEN: "run-secret" }),
      }),
    );
  });

  it("normalizes Codex token updates as context plus lifetime processed usage", async () => {
    const spawnProcess = vi.fn(() => fakeChild((message, child) => {
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "thread/start") write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "thread-usage" } } });
      if (message.method === "turn/start") {
        write({ jsonrpc: "2.0", id: message.id, result: { turn: { id: "turn-usage" } } });
        write({
          jsonrpc: "2.0",
          method: "thread/tokenUsage/updated",
          params: {
            threadId: "thread-usage",
            tokenUsage: {
              total: { inputTokens: 65_000, cachedInputTokens: 40_000, outputTokens: 10_000, totalTokens: 75_000 },
              last: { inputTokens: 45_000, cachedInputTokens: 30_000, outputTokens: 5_000, totalTokens: 50_000 },
              modelContextWindow: 200_000,
            },
          },
        });
        write({ jsonrpc: "2.0", method: "turn/completed", params: { threadId: "thread-usage", turn: { id: "turn-usage", status: "completed" } } });
      }
    }));
    const manager = new CliHarnessServerManager({
      spawnProcess,
      resolveBinary: () => "/fake/codex",
      terminate: async (child) => { child.emit("close", 0, null); },
    });
    managers.push(manager);
    const config = await manager.prepare({
      pluginId: "khadim.codex",
      bundled: true,
      engineSessionKey: "chat-codex-usage",
      projectPath: "/workspace/project",
      config: { binaryPath: "codex" },
    });
    const headers = { authorization: `Bearer ${config.bridgeToken}`, "content-type": "application/json" };
    const created = await fetch(`${config.bridgeUrl}/session`, { method: "POST", headers });
    const { id } = await created.json() as { id: string };
    const eventsResponse = await fetch(`${config.bridgeUrl}/session/${id}/events`, { headers });
    await fetch(`${config.bridgeUrl}/session/${id}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: "Measure usage", model: "gpt-5.6-sol" }),
    });

    const frame = new TextDecoder().decode((await eventsResponse.body!.getReader().read()).value);
    expect(frame).toContain(JSON.stringify({
      type: "khadim.usage",
      usage: {
        input: 0,
        output: 0,
        cache_read: 0,
        cache_write: 0,
        context_used: 50_000,
        context_size: 200_000,
        total_processed: 75_000,
      },
    }));
  });

  it("maps ACP usage_update to context occupancy instead of token buckets", async () => {
    const spawnProcess = vi.fn(() => fakeChild((message, child) => {
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize") write({ jsonrpc: "2.0", id: message.id, result: { agentCapabilities: {} } });
      if (message.method === "authenticate") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "session/new") write({ jsonrpc: "2.0", id: message.id, result: { sessionId: "cursor-usage" } });
      if (message.method === "session/set_model") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "session/prompt") {
        write({
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "cursor-usage",
            update: { sessionUpdate: "usage_update", used: 53_000, size: 200_000 },
          },
        });
        write({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } });
      }
    }));
    const manager = new CliHarnessServerManager({
      spawnProcess,
      resolveBinary: () => "/fake/cursor-agent",
      terminate: async (child) => { child.emit("close", 0, null); },
    });
    managers.push(manager);
    const config = await manager.prepare({
      pluginId: "khadim.cursor",
      bundled: true,
      engineSessionKey: "chat-cursor-usage",
      projectPath: "/workspace/project",
      config: { binaryPath: "cursor-agent" },
    });
    const headers = { authorization: `Bearer ${config.bridgeToken}`, "content-type": "application/json" };
    const created = await fetch(`${config.bridgeUrl}/session`, { method: "POST", headers });
    const { id } = await created.json() as { id: string };
    const eventsResponse = await fetch(`${config.bridgeUrl}/session/${id}/events`, { headers });
    await fetch(`${config.bridgeUrl}/session/${id}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: "Measure context", model: "auto" }),
    });

    const frame = new TextDecoder().decode((await eventsResponse.body!.getReader().read()).value);
    expect(frame).toContain(JSON.stringify({
      type: "khadim.usage",
      usage: {
        input: 0,
        output: 0,
        cache_read: 0,
        cache_write: 0,
        context_used: 53_000,
        context_size: 200_000,
      },
    }));
  });

  it("sets the ACP harness mode and bridges a declined tool permission", async () => {
    let resolvePermission!: (value: Record<string, unknown>) => void;
    const permissionResponse = new Promise<Record<string, unknown>>((resolve) => {
      resolvePermission = resolve;
    });
    let promptRpcId: unknown;
    let modeRequest: Record<string, unknown> | undefined;
    let sessionNewRequest: Record<string, unknown> | undefined;
    const spawnProcess = vi.fn(() => fakeChild((message, child) => {
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize") {
        write({ jsonrpc: "2.0", id: message.id, result: { agentCapabilities: { mcpCapabilities: { http: true } } } });
      }
      if (message.method === "authenticate") {
        write({ jsonrpc: "2.0", id: message.id, result: {} });
      }
      if (message.method === "session/new") {
        sessionNewRequest = message;
        write({ jsonrpc: "2.0", id: message.id, result: { sessionId: "cursor-one" } });
      }
      if (message.method === "session/set_model") {
        write({ jsonrpc: "2.0", id: message.id, result: {} });
      }
      if (message.method === "session/set_mode") {
        modeRequest = message;
        write({ jsonrpc: "2.0", id: message.id, result: {} });
      }
      if (message.method === "session/prompt") {
        promptRpcId = message.id;
        write({
          jsonrpc: "2.0",
          id: 77,
          method: "session/request_permission",
          params: {
            options: [{ optionId: "allow-once", kind: "allow_once" }],
          },
        });
      }
      if (message.id === 77 && message.result) {
        resolvePermission(message);
        write({ jsonrpc: "2.0", id: promptRpcId, result: { stopReason: "cancelled" } });
      }
    }));
    const manager = new CliHarnessServerManager({
      spawnProcess,
      resolveBinary: () => "/fake/cursor-agent",
      terminate: async (child) => { child.emit("close", 0, null); },
    });
    managers.push(manager);
    const config = await manager.prepare({
      pluginId: "khadim.cursor",
      bundled: true,
      engineSessionKey: "chat-cursor",
      projectPath: "/workspace/project",
      config: { binaryPath: "cursor-agent", customModels: "auto" },
      nativeToolMcp: { url: "http://127.0.0.1:45555/mcp", token: "run-secret", hasTools: true },
    });
    const headers = {
      authorization: `Bearer ${config.bridgeToken}`,
      "content-type": "application/json",
    };
    const created = await fetch(`${config.bridgeUrl}/session`, {
      method: "POST",
      headers,
    });
    const { id } = await created.json() as { id: string };
    const eventsResponse = await fetch(`${config.bridgeUrl}/session/${id}/events`, { headers });
    await fetch(`${config.bridgeUrl}/session/${id}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: "Edit a file", model: "auto", mode: "code" }),
    });

    const reader = eventsResponse.body!.getReader();
    const decoder = new TextDecoder();
    const approvalFrame = decoder.decode((await reader.read()).value);
    const approval = JSON.parse(approvalFrame.match(/data: (.+)/)?.[1] ?? "{}") as { request_id: string };
    await fetch(`${config.bridgeUrl}/session/${id}/approval/${approval.request_id}/reply`, {
      method: "POST",
      headers,
      body: JSON.stringify({ decision: "decline" }),
    });

    await expect(permissionResponse).resolves.toEqual({
      jsonrpc: "2.0",
      id: 77,
      result: { outcome: { outcome: "cancelled" } },
    });
    expect(modeRequest).toEqual(expect.objectContaining({
      method: "session/set_mode",
      params: { sessionId: "cursor-one", modeId: "code" },
    }));
    expect(sessionNewRequest).toEqual(expect.objectContaining({
      params: {
        cwd: "/workspace/project",
        mcpServers: [{
          type: "http",
          name: "khadim",
          url: "http://127.0.0.1:45555/mcp",
          headers: [{ name: "Authorization", value: "Bearer run-secret" }],
        }],
      },
    }));
  });

  it("preserves Cursor's native subagent completion notification", async () => {
    const spawnProcess = vi.fn(() => fakeChild((message, child) => {
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize") write({ jsonrpc: "2.0", id: message.id, result: { agentCapabilities: {} } });
      if (message.method === "authenticate") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "session/new") write({ jsonrpc: "2.0", id: message.id, result: { sessionId: "cursor-team" } });
      if (message.method === "session/prompt") {
        write({
          jsonrpc: "2.0",
          method: "cursor/task",
          params: {
            toolCallId: "task-126",
            description: "Explore codebase",
            prompt: "Find where authentication is handled.",
            subagentType: "explore",
            model: "composer-2",
            agentId: "agent-9",
            durationMs: 4200,
          },
        });
        write({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } });
      }
    }));
    const manager = new CliHarnessServerManager({
      spawnProcess,
      resolveBinary: () => "/fake/cursor-agent",
      terminate: async (child) => { child.emit("close", 0, null); },
    });
    managers.push(manager);
    const config = await manager.prepare({
      pluginId: "khadim.cursor",
      bundled: true,
      engineSessionKey: "chat-cursor-team",
      projectPath: "/workspace/project",
      config: { binaryPath: "cursor-agent" },
    });
    const headers = { authorization: `Bearer ${config.bridgeToken}`, "content-type": "application/json" };
    const created = await fetch(`${config.bridgeUrl}/session`, { method: "POST", headers });
    const { id } = await created.json() as { id: string };
    const eventsResponse = await fetch(`${config.bridgeUrl}/session/${id}/events`, { headers });
    await fetch(`${config.bridgeUrl}/session/${id}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: "Inspect the project" }),
    });

    const reader = eventsResponse.body!.getReader();
    const frame = new TextDecoder().decode((await reader.read()).value);
    expect(frame).toContain("khadim.step_complete");
    expect(frame).toContain("task-126");
    expect(frame).toContain("Explore codebase");
    await reader.cancel();
  });

  it("rejects tools enabled after an ACP session started without HTTP MCP support", async () => {
    let promptCalls = 0;
    const spawnProcess = vi.fn(() => fakeChild((message, child) => {
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize") write({ jsonrpc: "2.0", id: message.id, result: { agentCapabilities: {} } });
      if (message.method === "authenticate") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "session/new") write({ jsonrpc: "2.0", id: message.id, result: { sessionId: "grok-without-mcp" } });
      if (message.method === "session/prompt") {
        promptCalls += 1;
        write({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } });
      }
    }));
    const manager = new CliHarnessServerManager({
      spawnProcess,
      resolveBinary: () => "/fake/grok",
      terminate: async (child) => { child.emit("close", 0, null); },
    });
    managers.push(manager);
    const endpoint = { url: "http://127.0.0.1:45555/mcp", token: "run-secret", hasTools: false };
    const config = await manager.prepare({
      pluginId: "khadim.grok",
      bundled: true,
      engineSessionKey: "chat-grok-tools",
      projectPath: "/workspace/project",
      config: { binaryPath: "grok" },
      nativeToolMcp: endpoint,
    });
    const headers = { authorization: `Bearer ${config.bridgeToken}`, "content-type": "application/json" };
    const created = await fetch(`${config.bridgeUrl}/session`, { method: "POST", headers });
    const { id } = await created.json() as { id: string };
    await fetch(`${config.bridgeUrl}/session/${id}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: "First prompt" }),
    });
    await vi.waitFor(() => expect(promptCalls).toBe(1));

    await manager.prepare({
      pluginId: "khadim.grok",
      bundled: true,
      engineSessionKey: "chat-grok-tools",
      projectPath: "/workspace/project",
      config: { binaryPath: "grok" },
      nativeToolMcp: { ...endpoint, hasTools: true },
    });
    const eventsResponse = await fetch(`${config.bridgeUrl}/session/${id}/events`, { headers });
    await fetch(`${config.bridgeUrl}/session/${id}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: "Use the connected app" }),
    });

    const frame = new TextDecoder().decode((await eventsResponse.body!.getReader().read()).value);
    expect(JSON.parse(frame.match(/data: (.+)/)?.[1] ?? "{}")).toEqual(expect.objectContaining({
      type: "khadim.process_error",
      message: expect.stringContaining("does not advertise ACP HTTP MCP support"),
    }));
    expect(promptCalls).toBe(1);
  });

  it("maps a custom Grok answer to Other with an annotation", async () => {
    let questionResponse: Record<string, unknown> | undefined;
    let promptRpcId: unknown;
    const spawnProcess = vi.fn(() => fakeChild((message, child) => {
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize" || message.method === "authenticate") {
        write({ jsonrpc: "2.0", id: message.id, result: {} });
      }
      if (message.method === "session/new") {
        write({ jsonrpc: "2.0", id: message.id, result: { sessionId: "grok-one" } });
      }
      if (message.method === "session/set_model") {
        write({ jsonrpc: "2.0", id: message.id, result: {} });
      }
      if (message.method === "session/prompt") {
        promptRpcId = message.id;
        write({
          jsonrpc: "2.0",
          id: 88,
          method: "_x.ai/ask_user_question",
          params: {
            method: "x.ai/ask_user_question",
            params: {
              questions: [{
                id: "scope",
                question: "Which scope should Grok use?",
                options: [{ label: "Workspace" }, { label: "Session" }],
              }],
            },
          },
        });
      }
      if (message.id === 88 && message.result) {
        questionResponse = message;
        write({ jsonrpc: "2.0", id: promptRpcId, result: { stopReason: "end_turn" } });
      }
    }));
    const manager = new CliHarnessServerManager({
      spawnProcess,
      resolveBinary: () => "/fake/grok",
      terminate: async (child) => { child.emit("close", 0, null); },
    });
    managers.push(manager);
    const config = await manager.prepare({
      pluginId: "khadim.grok",
      bundled: true,
      engineSessionKey: "chat-grok",
      projectPath: "/workspace/project",
      config: { binaryPath: "grok", customModels: "grok-build" },
    });
    const headers = {
      authorization: `Bearer ${config.bridgeToken}`,
      "content-type": "application/json",
    };
    const created = await fetch(`${config.bridgeUrl}/session`, {
      method: "POST",
      headers,
    });
    const { id } = await created.json() as { id: string };
    const eventsResponse = await fetch(`${config.bridgeUrl}/session/${id}/events`, { headers });
    await fetch(`${config.bridgeUrl}/session/${id}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: "Choose a scope", model: "grok-build" }),
    });

    const reader = eventsResponse.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    const question = JSON.parse(first.match(/data: (.+)/)?.[1] ?? "{}") as { request_id: string };
    await fetch(`${config.bridgeUrl}/session/${id}/question/${question.request_id}/reply`, {
      method: "POST",
      headers,
      body: JSON.stringify({ answers: { scope: ["A temporary branch"] } }),
    });

    expect(questionResponse).toEqual({
      jsonrpc: "2.0",
      id: 88,
      result: {
        outcome: "accepted",
        answers: { "Which scope should Grok use?": ["Other"] },
        annotations: { "Which scope should Grok use?": { notes: "A temporary branch" } },
      },
    });
  });

  it("lets the same engineSessionKey reuse Codex then Cursor on separate completed turns without a kind mismatch", async () => {
    const codexChildren: ChildProcess[] = [];
    const cursorChildren: ChildProcess[] = [];
    let codexTurnCompleted = false;
    const codexSpawn = vi.fn(() => fakeChild((message, child) => {
      codexChildren.push(child);
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "thread/start") write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "codex-thread" } } });
      if (message.method === "turn/start") {
        write({ jsonrpc: "2.0", id: message.id, result: { turn: { id: "codex-turn" } } });
        write({ jsonrpc: "2.0", method: "turn/completed", params: { threadId: "codex-thread", turn: { id: "codex-turn", status: "completed" } } });
        codexTurnCompleted = true;
      }
    }));
    const cursorSpawn = vi.fn(() => fakeChild((message, child) => {
      cursorChildren.push(child);
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize") write({ jsonrpc: "2.0", id: message.id, result: { agentCapabilities: { mcpCapabilities: { http: true } } } });
      if (message.method === "authenticate") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "session/new") write({ jsonrpc: "2.0", id: message.id, result: { sessionId: "cursor-session" } });
      if (message.method === "session/prompt") write({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } });
    }));
    const spawnProcess = vi.fn((command: string) => command.includes("codex") ? codexSpawn() : cursorSpawn());
    const manager = new CliHarnessServerManager({
      spawnProcess,
      resolveBinary: (configured) => configured.includes("codex") ? "/fake/codex" : "/fake/cursor-agent",
      terminate: async (child) => { child.emit("close", 0, null); },
    });
    managers.push(manager);
    const engineSessionKey = "durable-chat";
    const projectPath = "/workspace/project";

    const codexConfig = await manager.prepare({
      pluginId: "khadim.codex",
      bundled: true,
      engineSessionKey,
      projectPath,
      config: { binaryPath: "codex" },
    });
    const codexHeaders = { authorization: `Bearer ${codexConfig.bridgeToken}`, "content-type": "application/json" };
    const codexCreated = await fetch(`${codexConfig.bridgeUrl}/session`, { method: "POST", headers: codexHeaders });
    const { id: codexSessionId } = await codexCreated.json() as { id: string };
    const codexEvents = await fetch(`${codexConfig.bridgeUrl}/session/${codexSessionId}/events`, { headers: codexHeaders });
    await fetch(`${codexConfig.bridgeUrl}/session/${codexSessionId}/prompt`, {
      method: "POST",
      headers: codexHeaders,
      body: JSON.stringify({ prompt: "Summarize the project" }),
    });
    await vi.waitFor(() => expect(codexTurnCompleted).toBe(true));
    await codexEvents.body!.cancel();

    const cursorConfig = await manager.prepare({
      pluginId: "khadim.cursor",
      bundled: true,
      engineSessionKey,
      projectPath,
      config: { binaryPath: "cursor-agent" },
    });

    expect(cursorConfig.bridgeUrl).not.toBe(codexConfig.bridgeUrl);
    expect(cursorConfig.bridgeToken).not.toBe(codexConfig.bridgeToken);
    expect(codexSpawn).toHaveBeenCalledTimes(1);

    const cursorHeaders = { authorization: `Bearer ${cursorConfig.bridgeToken}`, "content-type": "application/json" };
    const cursorCreated = await fetch(`${cursorConfig.bridgeUrl}/session`, { method: "POST", headers: cursorHeaders });
    const { id: cursorSessionId } = await cursorCreated.json() as { id: string };
    const cursorPrompt = await fetch(`${cursorConfig.bridgeUrl}/session/${cursorSessionId}/prompt`, {
      method: "POST",
      headers: cursorHeaders,
      body: JSON.stringify({ prompt: "Edit a file" }),
    });
    expect(cursorPrompt.status).toBe(202);
    await vi.waitFor(() => expect(cursorSpawn).toHaveBeenCalledTimes(1));

    const codexHealth = await fetch(`${codexConfig.bridgeUrl}/health`, { headers: codexHeaders });
    expect((await codexHealth.json() as { provider: string }).provider).toBe("codex");
    const cursorHealth = await fetch(`${cursorConfig.bridgeUrl}/health`, { headers: cursorHeaders });
    expect((await cursorHealth.json() as { provider: string }).provider).toBe("cursor");
  });

  it("keeps concurrent sessions using different harness kinds isolated from one another", async () => {
    const codexSpawn = vi.fn(() => fakeChild((message, child) => {
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "thread/start") write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "codex-thread-two" } } });
      if (message.method === "turn/start") {
        write({ jsonrpc: "2.0", id: message.id, result: { turn: { id: "codex-turn-two" } } });
        write({ jsonrpc: "2.0", method: "turn/completed", params: { threadId: "codex-thread-two", turn: { id: "codex-turn-two", status: "completed" } } });
      }
    }));
    const grokSpawn = vi.fn(() => fakeChild((message, child) => {
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize" || message.method === "authenticate") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "session/new") write({ jsonrpc: "2.0", id: message.id, result: { sessionId: "grok-session-two" } });
      if (message.method === "session/prompt") write({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } });
    }));
    const spawnProcess = vi.fn((command: string) => command.includes("codex") ? codexSpawn() : grokSpawn());
    const manager = new CliHarnessServerManager({
      spawnProcess,
      resolveBinary: (configured) => configured.includes("codex") ? "/fake/codex" : "/fake/grok",
      terminate: async (child) => { child.emit("close", 0, null); },
    });
    managers.push(manager);

    const codexConfig = await manager.prepare({
      pluginId: "khadim.codex",
      bundled: true,
      engineSessionKey: "chat-codex-concurrent",
      projectPath: "/workspace/codex-project",
      config: { binaryPath: "codex" },
    });
    const grokConfig = await manager.prepare({
      pluginId: "khadim.grok",
      bundled: true,
      engineSessionKey: "chat-grok-concurrent",
      projectPath: "/workspace/grok-project",
      config: { binaryPath: "grok" },
    });

    expect(codexConfig.bridgeUrl).not.toBe(grokConfig.bridgeUrl);
    const codexHealth = await fetch(`${codexConfig.bridgeUrl}/health`, { headers: { authorization: `Bearer ${codexConfig.bridgeToken}` } });
    const grokHealth = await fetch(`${grokConfig.bridgeUrl}/health`, { headers: { authorization: `Bearer ${grokConfig.bridgeToken}` } });
    expect((await codexHealth.json() as { provider: string }).provider).toBe("codex");
    expect((await grokHealth.json() as { provider: string }).provider).toBe("grok");
    expect(codexSpawn).toHaveBeenCalledTimes(0);
    expect(grokSpawn).toHaveBeenCalledTimes(0);
  });

  it("reuses the same harness bridge when prepared again without an intervening stop", async () => {
    const spawnProcess = vi.fn(() => fakeChild((message, child) => {
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "thread/start") write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "reuse-thread" } } });
    }));
    const manager = new CliHarnessServerManager({
      spawnProcess,
      resolveBinary: () => "/fake/codex",
      terminate: async (child) => { child.emit("close", 0, null); },
    });
    managers.push(manager);
    const first = await manager.prepare({
      pluginId: "khadim.codex",
      bundled: true,
      engineSessionKey: "reuse-chat",
      projectPath: "/workspace/project",
      config: { binaryPath: "codex" },
    });
    const second = await manager.prepare({
      pluginId: "khadim.codex",
      bundled: true,
      engineSessionKey: "reuse-chat",
      projectPath: "/workspace/project",
      config: { binaryPath: "codex", customModels: "auto" },
    });
    expect(second.bridgeUrl).toBe(first.bridgeUrl);
    expect(second.bridgeToken).toBe(first.bridgeToken);
    expect(spawnProcess).toHaveBeenCalledTimes(0);
  });

  it("coalesces concurrent preparation of the same harness session", async () => {
    const manager = new CliHarnessServerManager();
    managers.push(manager);
    const input = {
      pluginId: "khadim.codex",
      bundled: true,
      engineSessionKey: "concurrent-reuse-chat",
      projectPath: "/workspace/project",
      config: { binaryPath: "codex" },
    };

    const [first, second] = await Promise.all([
      manager.prepare(input),
      manager.prepare(input),
    ]);

    expect(second.bridgeUrl).toBe(first.bridgeUrl);
    expect(second.bridgeToken).toBe(first.bridgeToken);
    const health = await fetch(`${first.bridgeUrl}/health`, {
      headers: { authorization: `Bearer ${first.bridgeToken}` },
    });
    expect(health.status).toBe(200);
  });

  it("stop(engineSessionKey) cleans every matching keyed bridge across harness kinds", async () => {
    const spawnProcess = vi.fn((command: string) => fakeChild((message, child) => {
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "thread/start") write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "stop-thread" } } });
      if (message.method === "session/new") write({ jsonrpc: "2.0", id: message.id, result: { sessionId: "stop-session" } });
      if (message.method === "authenticate") write({ jsonrpc: "2.0", id: message.id, result: {} });
    }));
    const manager = new CliHarnessServerManager({
      spawnProcess,
      resolveBinary: (configured) => configured.includes("codex") ? "/fake/codex" : configured.includes("cursor") ? "/fake/cursor-agent" : "/fake/grok",
      terminate: async (child) => { child.emit("close", 0, null); },
    });
    managers.push(manager);
    const engineSessionKey = "multi-harness-chat";
    const projectPath = "/workspace/project";

    const codexConfig = await manager.prepare({ pluginId: "khadim.codex", bundled: true, engineSessionKey, projectPath, config: { binaryPath: "codex" } });
    const cursorConfig = await manager.prepare({ pluginId: "khadim.cursor", bundled: true, engineSessionKey, projectPath, config: { binaryPath: "cursor-agent" } });
    const grokConfig = await manager.prepare({ pluginId: "khadim.grok", bundled: true, engineSessionKey, projectPath, config: { binaryPath: "grok" } });

    expect(codexConfig.bridgeUrl).not.toBe(cursorConfig.bridgeUrl);
    expect(cursorConfig.bridgeUrl).not.toBe(grokConfig.bridgeUrl);

    await manager.stop(engineSessionKey);

    await expect(fetch(`${codexConfig.bridgeUrl}/health`, { headers: { authorization: `Bearer ${codexConfig.bridgeToken}` } })).rejects.toThrow();
    await expect(fetch(`${cursorConfig.bridgeUrl}/health`, { headers: { authorization: `Bearer ${cursorConfig.bridgeToken}` } })).rejects.toThrow();
    await expect(fetch(`${grokConfig.bridgeUrl}/health`, { headers: { authorization: `Bearer ${grokConfig.bridgeToken}` } })).rejects.toThrow();

    const refreshed = await manager.prepare({ pluginId: "khadim.codex", bundled: true, engineSessionKey, projectPath, config: { binaryPath: "codex" } });
    expect(refreshed.bridgeUrl).not.toBe(codexConfig.bridgeUrl);
    expect(refreshed.bridgeToken).not.toBe(codexConfig.bridgeToken);
  });

  it("stopProject cleans every bridge bound to the project path across harness kinds and sessions", async () => {
    const spawnProcess = vi.fn(() => fakeChild((message, child) => {
      const write = (value: unknown) => child.stdout?.emit("data", `${JSON.stringify(value)}\n`);
      if (message.method === "initialize") write({ jsonrpc: "2.0", id: message.id, result: {} });
      if (message.method === "thread/start") write({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "project-thread" } } });
      if (message.method === "session/new") write({ jsonrpc: "2.0", id: message.id, result: { sessionId: "project-session" } });
      if (message.method === "authenticate") write({ jsonrpc: "2.0", id: message.id, result: {} });
    }));
    const manager = new CliHarnessServerManager({
      spawnProcess,
      resolveBinary: (configured) => configured.includes("codex") ? "/fake/codex" : "/fake/grok",
      terminate: async (child) => { child.emit("close", 0, null); },
    });
    managers.push(manager);
    const projectPath = "/workspace/shared-project";
    const otherProjectPath = "/workspace/other-project";

    const sharedCodex = await manager.prepare({ pluginId: "khadim.codex", bundled: true, engineSessionKey: "shared-codex", projectPath, config: { binaryPath: "codex" } });
    const sharedGrok = await manager.prepare({ pluginId: "khadim.grok", bundled: true, engineSessionKey: "shared-grok", projectPath, config: { binaryPath: "grok" } });
    const otherCodex = await manager.prepare({ pluginId: "khadim.codex", bundled: true, engineSessionKey: "other-codex", projectPath: otherProjectPath, config: { binaryPath: "codex" } });

    await manager.stopProject(projectPath);

    await expect(fetch(`${sharedCodex.bridgeUrl}/health`, { headers: { authorization: `Bearer ${sharedCodex.bridgeToken}` } })).rejects.toThrow();
    await expect(fetch(`${sharedGrok.bridgeUrl}/health`, { headers: { authorization: `Bearer ${sharedGrok.bridgeToken}` } })).rejects.toThrow();
    const otherCodexHealth = await fetch(`${otherCodex.bridgeUrl}/health`, { headers: { authorization: `Bearer ${otherCodex.bridgeToken}` } });
    expect(otherCodexHealth.status).toBe(200);
  });
});
