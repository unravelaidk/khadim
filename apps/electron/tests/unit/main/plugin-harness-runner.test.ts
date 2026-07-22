import { createServer, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentStreamEvent } from "../../../src/shared/types";
import type { PluginHarnessEventResult, PluginHttpRequest } from "../../../src/shared/plugins";
import { PluginHarnessRunner } from "../../../src/main/plugins/harness-runner";
import type { PluginManager } from "../../../src/main/plugins/plugin-manager";

const servers: Array<ReturnType<typeof createServer>> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

function fakePluginManager(baseUrl: string): PluginManager {
  const store = new Map<string, string>();
  const manager = {
    get: async () => ({ entry: {
      id: "example.harness",
      name: "Example",
      version: "1.0.0",
      description: "Test",
      enabled: true,
      bundled: false,
      capabilities: ["harness"],
      harnesses: [{ id: "plugin:example.harness/example", pluginId: "example.harness", capabilityId: "example", name: "Example", description: "Test" }],
      permissions: { network: { allowedHosts: ["127.0.0.1"], allowHttp: true } },
      config: [],
    } }),
    configuration: async () => ({ baseUrl }),
    storeGet: async (_pluginId: string, key: string) => store.get(key),
    storeSet: async (_pluginId: string, key: string, value: string) => { store.set(key, value); },
    call: async <T>(_pluginId: string, operation: string, input: Record<string, unknown>): Promise<T> => {
      const sessionId = input.remoteSessionId as string | undefined;
      const plans: Record<string, PluginHttpRequest> = {
        "harness.health": { method: "GET", path: "/global/health" },
        "harness.session.get": { method: "GET", path: `/session/${sessionId}` },
        "harness.session.create": { method: "POST", path: "/session", body: {} },
        "harness.events": { method: "GET", path: "/event" },
        "harness.prompt": { method: "POST", path: `/session/${sessionId}/prompt_async`, body: { parts: [{ type: "text", text: input.prompt }] } },
        "harness.question.reply": { method: "POST", path: `/question/${input.questionRequestId}/reply`, body: { answers: input.questionAnswers } },
        "harness.approval.reply": { method: "POST", path: `/approval/${input.approvalRequestId}/reply`, body: { decision: input.approvalDecision } },
        "harness.abort": { method: "POST", path: `/session/${sessionId}/abort` },
      };
      if (operation === "harness.endpoint") return {
        baseUrl,
        headers: { "x-opencode-directory": input.projectPath as string },
      } as T;
      if (operation === "harness.session.parse") return { sessionId: "session-one" } as T;
      if (operation === "harness.event") {
        const event = input.event as { type: string; properties: { sessionID: string; delta?: string } };
        const mapped: PluginHarnessEventResult = event.type === "text"
          ? { events: [{ event_type: "text_delta", content: event.properties.delta }] }
          : event.type === "permission"
            ? { events: [{ event_type: "approval", metadata: { requestId: "approval-one", kind: "file-change", title: "Allow this file change?" } }] }
          : event.type === "idle"
            ? { events: [{ event_type: "done", content: "Run completed." }], terminal: true }
            : { events: [] };
        return mapped as T;
      }
      return plans[operation] as T;
    },
  };
  return manager as unknown as PluginManager;
}

describe("plugin harness runner", () => {
  it("creates a durable remote session and streams normalized events", async () => {
    let eventResponse: ServerResponse | undefined;
    const requests: Array<{ method?: string; url?: string; directory?: string }> = [];
    const server = createServer((request, response) => {
      requests.push({ method: request.method, url: request.url, directory: request.headers["x-opencode-directory"] as string | undefined });
      if (request.url === "/global/health") { response.setHeader("content-type", "application/json"); response.end('{"healthy":true}'); return; }
      if (request.url === "/session" && request.method === "POST") { response.setHeader("content-type", "application/json"); response.end('{"id":"session-one"}'); return; }
      if (request.url === "/event") {
        eventResponse = response;
        response.writeHead(200, { "content-type": "text/event-stream", connection: "keep-alive" });
        response.write('data: {"type":"server.connected","properties":{}}\n\n');
        return;
      }
      if (request.url === "/session/session-one/prompt_async") {
        response.writeHead(204).end();
        eventResponse?.write('data: {"type":"text","properties":{"sessionID":"session-one","delta":"Hello"}}\r');
        setTimeout(() => {
          eventResponse?.write('\n\r\ndata: {"type":"idle","properties":{"sessionID":"session-one"}}\r\n\r\n');
        }, 0);
        return;
      }
      response.writeHead(404).end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const events: AgentStreamEvent[] = [];
    const runner = new PluginHarnessRunner(fakePluginManager(`http://127.0.0.1:${address.port}`));

    const run = runner.start({
      harnessId: "plugin:example.harness/example",
      projectPath: "/workspace/example",
      engineSessionKey: "chat-one",
      prompt: "Say hello",
      model: { provider: "example", model: "model" },
    }, (event) => events.push(event));
    await run.closed;

    expect(events).toEqual([
      { event_type: "text_delta", content: "Hello" },
      { event_type: "done", content: "Run completed." },
    ]);
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: "/event", directory: "/workspace/example" }),
      expect.objectContaining({ url: "/session/session-one/prompt_async", method: "POST" }),
    ]));
  });

  it("routes normalized question answers through the active harness plugin", async () => {
    let eventResponse: ServerResponse | undefined;
    let replyBody: unknown;
    const server = createServer((request, response) => {
      if (request.url === "/global/health") { response.end('{"healthy":true}'); return; }
      if (request.url === "/session" && request.method === "POST") { response.end('{"id":"session-one"}'); return; }
      if (request.url === "/event") {
        eventResponse = response;
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.flushHeaders();
        return;
      }
      if (request.url === "/session/session-one/prompt_async") {
        response.writeHead(204).end();
        return;
      }
      if (request.url === "/question/request-one/reply") {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          replyBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          response.end('{"accepted":true}');
          eventResponse?.write('data: {"type":"idle","properties":{"sessionID":"session-one"}}\n\n');
        });
        return;
      }
      if (request.url === "/session/session-one/abort") { response.end('{}'); return; }
      response.writeHead(404).end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const runner = new PluginHarnessRunner(fakePluginManager(`http://127.0.0.1:${address.port}`));
    const run = runner.start({
      harnessId: "plugin:example.harness/example",
      projectPath: "/workspace/example",
      engineSessionKey: "chat-one",
      prompt: "Ask me",
      model: { provider: "example", model: "model" },
    }, () => undefined);

    await vi.waitFor(() => expect(eventResponse).toBeDefined());
    await run.respondToQuestion("request-one", { "question-0": ["Ship it"] });
    await run.closed;

    expect(replyBody).toEqual({ answers: { "question-0": ["Ship it"] } });
  });

  it("automatically accepts file changes in auto-edit runtime mode", async () => {
    let eventResponse: ServerResponse | undefined;
    let replyBody: unknown;
    const server = createServer((request, response) => {
      if (request.url === "/global/health") { response.end('{"healthy":true}'); return; }
      if (request.url === "/session" && request.method === "POST") { response.end('{"id":"session-one"}'); return; }
      if (request.url === "/event") {
        eventResponse = response;
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.flushHeaders();
        return;
      }
      if (request.url === "/session/session-one/prompt_async") {
        response.writeHead(204).end();
        eventResponse?.write('data: {"type":"permission","properties":{"sessionID":"session-one"}}\n\n');
        return;
      }
      if (request.url === "/approval/approval-one/reply") {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          replyBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          response.end('{"accepted":true}');
          eventResponse?.write('data: {"type":"idle","properties":{"sessionID":"session-one"}}\n\n');
        });
        return;
      }
      response.writeHead(404).end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const events: AgentStreamEvent[] = [];
    const runner = new PluginHarnessRunner(fakePluginManager(`http://127.0.0.1:${address.port}`));

    const run = runner.start({
      harnessId: "plugin:example.harness/example",
      projectPath: "/workspace/example",
      engineSessionKey: "chat-one",
      prompt: "Edit the file",
      model: { provider: "example", model: "model" },
      runtimeMode: "auto-accept-edits",
    }, (event) => events.push(event));
    await run.closed;

    expect(replyBody).toEqual({ decision: "accept" });
    expect(events).toContainEqual(expect.objectContaining({
      event_type: "approval",
      metadata: expect.objectContaining({ requestId: "approval-one", resolved: true, automatic: true }),
    }));
  });

  it("blocks a plugin endpoint outside its manifest allowlist", async () => {
    const events: AgentStreamEvent[] = [];
    const runner = new PluginHarnessRunner(fakePluginManager("http://example.com:4096"));
    const run = runner.start({
      harnessId: "plugin:example.harness/example",
      projectPath: "/workspace/example",
      engineSessionKey: "chat-one",
      prompt: "Hello",
      model: { provider: "example", model: "model" },
    }, (event) => events.push(event));
    await run.closed;
    expect(events[0]).toMatchObject({ event_type: "error", content: expect.stringContaining("not allowed") });
  });

  it("chains built-in harness preparers with the project context", async () => {
    const first = vi.fn(async (input) => ({ ...input.config, first: true }));
    const second = vi.fn(async (input) => ({ ...input.config, second: true }));
    const events: AgentStreamEvent[] = [];
    const runner = new PluginHarnessRunner(fakePluginManager("http://example.com:4096"), [
      { prepare: first },
      { prepare: second },
    ]);
    const run = runner.start({
      harnessId: "plugin:example.harness/example",
      projectPath: "/workspace/example",
      engineSessionKey: "chat-one",
      prompt: "Hello",
      model: { provider: "example", model: "model" },
    }, (event) => events.push(event));
    await run.closed;

    expect(first).toHaveBeenCalledWith(expect.objectContaining({ projectPath: "/workspace/example", config: { baseUrl: "http://example.com:4096" } }));
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ projectPath: "/workspace/example", config: expect.objectContaining({ first: true }) }));
  });

  it("aborts the remote process when event mapping fails", async () => {
    let eventResponse: ServerResponse | undefined;
    let aborted = false;
    const server = createServer((request, response) => {
      if (request.url === "/global/health") { response.end('{"healthy":true}'); return; }
      if (request.url === "/session" && request.method === "POST") { response.end('{"id":"session-one"}'); return; }
      if (request.url === "/event") {
        eventResponse = response;
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.flushHeaders();
        return;
      }
      if (request.url === "/session/session-one/prompt_async") {
        response.writeHead(204).end();
        eventResponse?.write('data: {"type":"text","properties":{"sessionID":"session-one","delta":"unsafe"}}\n\n');
        return;
      }
      if (request.url === "/session/session-one/abort") {
        aborted = true;
        response.writeHead(200).end('{}');
        eventResponse?.end();
        return;
      }
      response.writeHead(404).end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const manager = fakePluginManager(`http://127.0.0.1:${address.port}`);
    const originalCall = manager.call.bind(manager);
    manager.call = async <T>(pluginId: string, operation: string, input: unknown): Promise<T> => {
      if (operation === "harness.event") throw new Error("Broken event mapper");
      return originalCall<T>(pluginId, operation, input);
    };
    const events: AgentStreamEvent[] = [];
    const runner = new PluginHarnessRunner(manager);

    const run = runner.start({
      harnessId: "plugin:example.harness/example",
      projectPath: "/workspace/example",
      engineSessionKey: "chat-one",
      prompt: "Hello",
      model: { provider: "example", model: "model" },
    }, (event) => events.push(event));
    await run.closed;

    expect(aborted).toBe(true);
    expect(events).toEqual([{ event_type: "error", content: "Broken event mapper" }]);
  });
});
