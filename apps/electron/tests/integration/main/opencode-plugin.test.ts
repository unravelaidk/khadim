import { createServer, type ServerResponse } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectStore } from "../../../src/main/project-store";
import { callCorePlugin, inspectCorePlugin } from "../../../src/main/plugins/core-runtime";
import { PluginHarnessRunner } from "../../../src/main/plugins/harness-runner";
import type { PluginManager } from "../../../src/main/plugins/plugin-manager";
import { applySequencedAgentEvent } from "../../../src/shared/agent-event-reducer";
import type { AgentStreamEvent, Conversation } from "../../../src/shared/types";

const modulePath = resolve(process.cwd(), "plugins/builtin/opencode/opencode.wasm");
const servers: Array<ReturnType<typeof createServer>> = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolveClose) => server.close(() => resolveClose()))));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function actualOpenCodePluginManager(baseUrl: string): PluginManager {
  const store = new Map<string, string>();
  return {
    get: async () => ({ entry: {
      id: "khadim.opencode",
      name: "OpenCode",
      version: "0.3.0",
      description: "Test",
      enabled: true,
      bundled: true,
      capabilities: ["harness"],
      harnesses: [{ id: "plugin:khadim.opencode/opencode", pluginId: "khadim.opencode", capabilityId: "opencode", name: "OpenCode", description: "Test" }],
      permissions: { network: { allowedHosts: ["127.0.0.1", "localhost", "::1"], allowHttp: true } },
      config: [],
    } }),
    configuration: async () => ({ baseUrl }),
    storeGet: async (_pluginId: string, key: string) => store.get(key),
    storeSet: async (_pluginId: string, key: string, value: string) => { store.set(key, value); },
    call: async <T>(_pluginId: string, operation: string, input: unknown) => callCorePlugin<T>(modulePath, operation, input),
  } as unknown as PluginManager;
}

describe("bundled OpenCode WebAssembly plugin", () => {
  it("loads through the production ABI and exposes its harness", async () => {
    await expect(inspectCorePlugin(modulePath)).resolves.toEqual({
      info: { id: "khadim.opencode", name: "OpenCode", version: "0.3.0", apiVersion: 1 },
      capabilities: {
        harnesses: [{
          id: "opencode",
          name: "OpenCode",
          description: "Use a loopback OpenCode server as the agent harness.",
          icon: "opencode",
        }],
      },
    });
  });

  it("builds scoped endpoint, prompt, and normalized event operations", async () => {
    const context = {
      harnessId: "opencode",
      projectPath: "/workspace/project",
      engineSessionKey: "chat-one",
      remoteSessionId: "session/one",
      prompt: "Say hello",
      systemPrompt: "Be concise.",
      model: { provider: "openai", model: "gpt-5" },
      mode: "plan",
      config: { baseUrl: "http://127.0.0.1:4096/" },
    };

    await expect(callCorePlugin(modulePath, "harness.endpoint", context)).resolves.toEqual({
      baseUrl: "http://127.0.0.1:4096",
      headers: { "x-opencode-directory": "/workspace/project" },
    });
    await expect(callCorePlugin(modulePath, "harness.prompt", context)).resolves.toEqual({
      method: "POST",
      path: "/session/session%2Fone/prompt_async",
      body: {
        parts: [{ type: "text", text: "Say hello" }],
        system: "Be concise.",
        model: { providerID: "openai", modelID: "gpt-5" },
        agent: "plan",
      },
    });
    await expect(callCorePlugin(modulePath, "harness.event", {
      ...context,
      remoteSessionId: "session-one",
      event: {
        type: "message.part.delta",
        properties: { sessionID: "session-one", messageID: "message-one", partID: "part-one", field: "text", delta: "Hello" },
      },
    })).resolves.toEqual({ events: [{ event_type: "text_delta", content: "Hello" }] });
    await expect(callCorePlugin(modulePath, "harness.event", {
      ...context,
      remoteSessionId: "session-one",
      event: {
        type: "question.asked",
        properties: {
          id: "request-one",
          sessionID: "session-one",
          questions: [{
            header: "Delivery",
            question: "How should this ship?",
            options: [{ label: "Now", description: "Release immediately" }],
            multiple: false,
          }],
        },
      },
    })).resolves.toEqual({ events: [{
      event_type: "question",
      metadata: {
        requestId: "request-one",
        questions: [{
          id: "question-0-delivery",
          header: "Delivery",
          question: "How should this ship?",
          options: [{ label: "Now", description: "Release immediately" }],
          multiSelect: false,
        }],
      },
    }] });
    await expect(callCorePlugin(modulePath, "harness.question.reply", {
      ...context,
      questionRequestId: "request/one",
      questionAnswers: { "question-0-delivery": ["Now"] },
    })).resolves.toEqual({
      method: "POST",
      path: "/question/request%2Fone/reply",
      body: { answers: [["Now"]] },
    });
  });

  it("keeps OpenCode tool events valid through chat persistence", async () => {
    const mapped = await callCorePlugin<{ events: AgentStreamEvent[] }>(modulePath, "harness.event", {
      remoteSessionId: "session-one",
      event: {
        type: "message.part.updated",
        properties: {
          sessionID: "session-one",
          part: {
            id: "part-one",
            sessionID: "session-one",
            type: "tool",
            tool: "glob",
            callID: "call-one",
            state: {
              status: "completed",
              input: { pattern: "**/*rpm*" },
              output: "No files found",
              title: "",
            },
          },
        },
      },
    });
    const directory = await mkdtemp(join(tmpdir(), "khadim-opencode-persistence-"));
    temporaryDirectories.push(directory);
    const projectDirectory = join(directory, "project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(directory);
    const project = await store.addProject(projectDirectory);
    const conversation: Conversation = {
      id: "chat-one",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-one",
      title: "Find the RPM",
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
      messages: [
        { id: "user-one", role: "user", content: "Where is the RPM?", createdAt: "2026-07-21T00:00:00.000Z", status: "complete" },
        { id: "assistant-one", role: "assistant", content: "", createdAt: "2026-07-21T00:00:00.000Z", status: "streaming", runId: "run-one" },
      ],
      runs: [{
        id: "run-one",
        projectId: project.id,
        conversationId: "chat-one",
        userMessageId: "user-one",
        assistantMessageId: "assistant-one",
        status: "running",
        createdAt: "2026-07-21T00:00:00.000Z",
        agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
        model: { id: "model-one", name: "Model", provider: "openai", model: "gpt-5" },
        harness: "plugin:khadim.opencode/opencode",
        enabledTools: ["files"],
      }],
    };

    const reduced = applySequencedAgentEvent(conversation, "run-one", "assistant-one", 1, mapped.events[0], new Map());

    expect(reduced.messages[1].toolCalls?.[0]).toMatchObject({ id: "call-one", tool: "glob", title: "glob", status: "complete" });
    await expect(store.saveConversation(reduced)).resolves.toBeUndefined();
  });

  it("runs end to end against the OpenCode HTTP and SSE protocol", async () => {
    let eventResponse: ServerResponse | undefined;
    let promptBody: unknown;
    const server = createServer((request, response) => {
      if (request.url === "/global/health") {
        response.setHeader("content-type", "application/json");
        response.end('{"healthy":true,"version":"test"}');
        return;
      }
      if (request.url === "/session" && request.method === "POST") {
        response.setHeader("content-type", "application/json");
        response.end('{"id":"session-one"}');
        return;
      }
      if (request.url === "/event") {
        eventResponse = response;
        response.writeHead(200, { "content-type": "text/event-stream", connection: "keep-alive" });
        response.write('data: {"type":"server.connected","properties":{}}\n\n');
        return;
      }
      if (request.url === "/session/session-one/prompt_async" && request.method === "POST") {
        const chunks: Uint8Array[] = [];
        request.on("data", (chunk: Uint8Array) => chunks.push(chunk));
        request.on("end", () => {
          promptBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          response.writeHead(204).end();
          eventResponse?.write('data: {"id":"evt_text","type":"message.part.delta","properties":{"sessionID":"session-one","messageID":"message-one","partID":"part-one","field":"text","delta":"Hello from OpenCode"}}\n\n');
          eventResponse?.write('data: {"id":"evt_idle","type":"session.status","properties":{"sessionID":"session-one","status":{"type":"idle"}}}\n\n');
        });
        return;
      }
      response.writeHead(404).end();
    });
    servers.push(server);
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address() as AddressInfo;
    const events: AgentStreamEvent[] = [];
    const runner = new PluginHarnessRunner(actualOpenCodePluginManager(`http://127.0.0.1:${address.port}`));

    const run = runner.start({
      harnessId: "plugin:khadim.opencode/opencode",
      projectPath: "/workspace/project",
      engineSessionKey: "chat-one",
      prompt: "Say hello",
      systemPrompt: "Be concise.",
      model: { provider: "openai", model: "gpt-5" },
    }, (event) => events.push(event));
    await run.closed;

    expect(promptBody).toEqual({
      parts: [{ type: "text", text: "Say hello" }],
      system: "Be concise.",
      model: { providerID: "openai", modelID: "gpt-5" },
    });
    expect(events).toEqual([
      { event_type: "text_delta", content: "Hello from OpenCode" },
      { event_type: "done", content: "Run completed." },
    ]);
  });
});
