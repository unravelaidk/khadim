import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import { ClaudeCodeServerManager } from "../../../src/main/plugins/claude-code-server-manager";

const managers: ClaudeCodeServerManager[] = [];
const originalUnrelatedSecret = process.env.UNRELATED_ELECTRON_SECRET;

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

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.stopAll()));
  if (originalUnrelatedSecret === undefined) delete process.env.UNRELATED_ELECTRON_SECRET;
  else process.env.UNRELATED_ELECTRON_SECRET = originalUnrelatedSecret;
});

describe("ClaudeCodeServerManager", () => {
  it("pauses AskUserQuestion through the SDK and resumes with the submitted answer", async () => {
    let permissionResult: unknown;
    const createQuery = vi.fn((params: Parameters<typeof import("@anthropic-ai/claude-agent-sdk").query>[0]) => {
      const generator = (async function* (): AsyncGenerator<unknown> {
        if (typeof params.prompt === "string") throw new Error("Expected a streaming Claude prompt.");
        await params.prompt[Symbol.asyncIterator]().next();
        permissionResult = await params.options?.canUseTool?.("AskUserQuestion", {
          questions: [{
            header: "Delivery",
            question: "When should this ship?",
            options: [{ label: "Now", description: "Ship immediately" }],
            multiSelect: false,
          }],
        }, {
          signal: new AbortController().signal,
          toolUseID: "tool-one",
          requestId: "request-one",
        });
        yield { type: "result", subtype: "success", session_id: "session-one", usage: {} };
      })() as unknown as Query;
      Object.assign(generator, { interrupt: vi.fn(async () => undefined), close: vi.fn() });
      return generator;
    });
    const manager = new ClaudeCodeServerManager({ createQuery, resolveBinary: () => "/resolved/claude" });
    managers.push(manager);
    const config = await manager.prepare({
      pluginId: "khadim.claude-code",
      bundled: true,
      engineSessionKey: "chat-question",
      projectPath: "/workspace/project",
      config: { binaryPath: "claude" },
      nativeToolMcp: { url: "http://127.0.0.1:45555/mcp", token: "run-secret", hasTools: true },
    });
    const headers = { authorization: `Bearer ${config.bridgeToken}`, "content-type": "application/json" };
    const created = await fetch(`${config.bridgeUrl}/session`, { method: "POST", headers });
    const { id } = await created.json() as { id: string };
    const events = await fetch(`${config.bridgeUrl}/session/${id}/events`, { headers });
    await fetch(`${config.bridgeUrl}/session/${id}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: "Prepare release", model: "claude-sonnet-4-6" }),
    });
    const reader = events.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    expect(first).toContain('"type":"khadim.question"');
    const answered = await fetch(`${config.bridgeUrl}/session/${id}/question/request-one/reply`, {
      method: "POST",
      headers,
      body: JSON.stringify({ answers: { "When should this ship?": ["Now"] } }),
    });
    expect(answered.status).toBe(200);
    await reader.read();

    expect(permissionResult).toEqual({
      behavior: "allow",
      updatedInput: {
        questions: expect.any(Array),
        answers: { "When should this ship?": "Now" },
      },
    });
    expect(createQuery).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        mcpServers: {
          khadim: {
            type: "http",
            url: "http://127.0.0.1:45555/mcp",
            headers: { Authorization: "Bearer run-secret" },
            alwaysLoad: true,
          },
        },
        allowedTools: ["mcp__khadim__*"],
      }),
    }));
  });

  it("prepares an authenticated loopback bridge for the bundled Claude Code plugin", async () => {
    const manager = new ClaudeCodeServerManager();
    managers.push(manager);

    const input = {
      pluginId: "khadim.claude-code",
      bundled: true,
      engineSessionKey: "chat-one",
      projectPath: "/workspace/project",
      config: { binaryPath: "claude" },
    };
    const [config, reused] = await Promise.all([manager.prepare(input), manager.prepare(input)]);

    expect(config.bridgeUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(reused.bridgeUrl).toBe(config.bridgeUrl);
    expect(reused.bridgeToken).toBe(config.bridgeToken);
    expect(config.bridgeToken).toEqual(expect.any(String));
    expect((config.bridgeToken as string).length).toBeGreaterThanOrEqual(32);

    const unauthorized = await fetch(`${config.bridgeUrl}/health`);
    expect(unauthorized.status).toBe(401);

    const health = await fetch(`${config.bridgeUrl}/health`, {
      headers: { authorization: `Bearer ${config.bridgeToken}` },
    });
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ healthy: true, provider: "claude-code" });
  });

  it("runs Claude in the project, streams JSON events, and resumes the durable session", async () => {
    process.env.UNRELATED_ELECTRON_SECRET = "must-not-leak";
    const children: ChildProcess[] = [];
    const stdinPrompts: string[] = [];
    const spawnProcess = vi.fn((_command: string, args: ReadonlyArray<string>, _options: SpawnOptions) => {
      const child = fakeChild();
      let stdinPrompt = "";
      child.stdin?.on("data", (chunk: Buffer | string) => { stdinPrompt += chunk.toString(); });
      child.stdin?.once("finish", () => stdinPrompts.push(stdinPrompt));
      children.push(child);
      const sessionFlag = args.includes("--resume") ? "--resume" : "--session-id";
      const sessionId = args[args.indexOf(sessionFlag) + 1];
      queueMicrotask(() => {
        child.stdout?.emit("data", Buffer.from(`${JSON.stringify({ type: "system", subtype: "init", session_id: sessionId })}\n`));
        child.stdout?.emit("data", Buffer.from(`${JSON.stringify({ type: "result", subtype: children.length === 1 ? "error_during_execution" : "success", session_id: sessionId })}\n`));
        child.stdout?.emit("end");
        child.emit("close", 0, null);
      });
      return child;
    });
    const resolveBinary = vi.fn(() => "/resolved/claude");
    const manager = new ClaudeCodeServerManager({ spawnProcess, terminate: async () => undefined, resolveBinary });
    managers.push(manager);
    const config = await manager.prepare({
      pluginId: "khadim.claude-code",
      bundled: true,
      engineSessionKey: "chat-one",
      projectPath: "/workspace/project",
      config: { binaryPath: "claude", permissionMode: "acceptEdits", claudeHome: "~/claude-work" },
    });
    const headers = { authorization: `Bearer ${config.bridgeToken}`, "content-type": "application/json" };

    const created = await fetch(`${config.bridgeUrl}/session`, { method: "POST", headers });
    const { id } = await created.json() as { id: string };
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    async function run(prompt: string): Promise<string> {
      const events = await fetch(`${config.bridgeUrl}/session/${id}/events`, { headers });
      const submitted = await fetch(`${config.bridgeUrl}/session/${id}/prompt`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt, systemPrompt: "Be concise.", model: "claude-sonnet-4-6" }),
      });
      expect(submitted.status).toBe(202);
      return events.text();
    }

    const firstEvents = await run("First turn");
    expect(firstEvents).toContain('"type":"system"');
    expect(firstEvents).toContain('"type":"result"');
    const secondEvents = await run("Second turn");
    expect(secondEvents).toContain('"type":"result"');

    expect(spawnProcess).toHaveBeenNthCalledWith(
      1,
      "/resolved/claude",
      expect.arrayContaining([
      "--print", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
      "--permission-mode", "acceptEdits", "--model", "claude-sonnet-4-6",
        "--append-system-prompt-file", expect.stringContaining("system-prompt.txt"),
        "--setting-sources", "user", "--session-id", id,
      ]),
      expect.objectContaining({
        cwd: "/workspace/project",
        detached: process.platform !== "win32",
        env: expect.objectContaining({ CLAUDE_CONFIG_DIR: join(homedir(), "claude-work"), HOME: process.env.HOME }),
      }),
    );
    expect(resolveBinary).toHaveBeenCalledWith("claude");
    expect(spawnProcess.mock.calls[0]?.[1]).not.toContain("First turn");
    expect(spawnProcess.mock.calls[0]?.[1]).not.toContain("Be concise.");
    expect(spawnProcess.mock.calls[0]?.[2].env).not.toHaveProperty("UNRELATED_ELECTRON_SECRET");
    expect(spawnProcess.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(["--resume", id]));
    expect(spawnProcess.mock.calls[1]?.[1]).not.toContain("Second turn");
    expect(children).toHaveLength(2);
    expect(stdinPrompts).toEqual(["First turn", "Second turn"]);
  });

  it("turns a Claude stdin pipe failure into a streamed process error", async () => {
    const spawnProcess = vi.fn(() => {
      const child = fakeChild();
      queueMicrotask(() => {
        child.stdin?.emit("error", new Error("write EPIPE"));
        child.emit("close", 1, null);
      });
      return child;
    });
    const manager = new ClaudeCodeServerManager({ spawnProcess, resolveBinary: () => "/resolved/claude" });
    managers.push(manager);
    const config = await manager.prepare({
      pluginId: "khadim.claude-code",
      bundled: true,
      engineSessionKey: "chat-epipe",
      projectPath: "/workspace/project",
      config: {},
    });
    const headers = { authorization: `Bearer ${config.bridgeToken}`, "content-type": "application/json" };
    const created = await fetch(`${config.bridgeUrl}/session`, { method: "POST", headers });
    const { id } = await created.json() as { id: string };
    const eventResponse = await fetch(`${config.bridgeUrl}/session/${id}/events`, { headers });
    await fetch(`${config.bridgeUrl}/session/${id}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: "Large confidential prompt" }),
    });

    expect(await eventResponse.text()).toContain("write EPIPE");
  });

  it("recovers a persisted session whose Claude transcript is missing", async () => {
    const persistedId = "11111111-1111-4111-8111-111111111111";
    const spawnProcess = vi.fn((_command: string, args: ReadonlyArray<string>) => {
      const child = fakeChild();
      queueMicrotask(() => {
        const stale = args.includes("--resume");
        child.stdout?.emit("data", Buffer.from(`${JSON.stringify(stale
          ? { type: "result", subtype: "error_during_execution", session_id: persistedId, errors: ["No conversation found with session ID"] }
          : { type: "result", subtype: "success", session_id: persistedId })}\n`));
        child.emit("close", 0, null);
      });
      return child;
    });
    const manager = new ClaudeCodeServerManager({ spawnProcess, resolveBinary: () => "/resolved/claude" });
    managers.push(manager);
    const config = await manager.prepare({
      pluginId: "khadim.claude-code",
      bundled: true,
      engineSessionKey: "chat-restored",
      projectPath: "/workspace/project",
      config: {},
    });
    const headers = { authorization: `Bearer ${config.bridgeToken}`, "content-type": "application/json" };
    await expect(fetch(`${config.bridgeUrl}/session/${persistedId}`, { headers })).resolves.toHaveProperty("status", 200);
    const events = fetch(`${config.bridgeUrl}/session/${persistedId}/events`, { headers });
    const submitted = await fetch(`${config.bridgeUrl}/session/${persistedId}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: "Recover this turn" }),
    });

    expect(submitted.status).toBe(202);
    const stream = await (await events).text();
    expect(stream).toContain('"subtype":"success"');
    expect(stream).not.toContain("No conversation found");
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    expect(spawnProcess.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(["--resume", persistedId]));
    expect(spawnProcess.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(["--session-id", persistedId]));
  });
});
