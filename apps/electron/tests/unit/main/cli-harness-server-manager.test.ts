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
});
