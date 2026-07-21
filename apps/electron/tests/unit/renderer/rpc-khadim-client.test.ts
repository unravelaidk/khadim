import { describe, expect, it, vi } from "vitest";
import type { AgentEventEnvelope, DiscordSettings } from "../../../src/shared/types";
import { createRpcKhadimClient, type KhadimPushEvent, type KhadimRpcMethod, type KhadimRpcTransport } from "../../../src/renderer/src/runtime/rpc-khadim-client";

describe("RPC Khadim client", () => {
  it("maps the runtime-neutral interface to method calls", async () => {
    const invoke = vi.fn();
    const transport: KhadimRpcTransport = {
      async invoke<T>(method: KhadimRpcMethod, args?: unknown[]) {
        invoke(method, args);
        return { id: "project-one" } as T;
      },
      subscribe: vi.fn(() => () => undefined),
    };
    const client = createRpcKhadimClient(transport, { platform: "linux", nativeWindowControls: true });

    await client.projects.rename("project-one", "Renamed");
    await client.models.syncCodex();
    await client.google.connect();
    await client.windowControls?.close();

    expect(invoke).toHaveBeenNthCalledWith(1, "projects.rename", ["project-one", "Renamed"]);
    expect(invoke).toHaveBeenNthCalledWith(2, "models.syncCodex", [false]);
    expect(invoke).toHaveBeenNthCalledWith(3, "google.connect", []);
    expect(invoke).toHaveBeenNthCalledWith(4, "window.close", []);
  });

  it("routes push events to the matching listener", () => {
    const listeners: Array<(event: KhadimPushEvent) => void> = [];
    const transport: KhadimRpcTransport = {
      invoke: async <T>(_method: KhadimRpcMethod) => undefined as T,
      subscribe: (listener) => { listeners.push(listener); return () => undefined; },
    };
    const client = createRpcKhadimClient(transport);
    const agentListener = vi.fn();
    const discordListener = vi.fn();
    client.agent.onEvent(agentListener);
    client.discord.onStatus(discordListener);
    const envelope = { runId: "run-one", sequence: 1, event: { event_type: "done" } } as AgentEventEnvelope;
    const settings = { connected: true } as DiscordSettings;

    listeners.forEach((listener) => listener({ type: "agent.event", payload: envelope }));
    listeners.forEach((listener) => listener({ type: "discord.status", payload: settings }));
    expect(agentListener).toHaveBeenCalledWith(envelope);
    expect(discordListener).toHaveBeenCalledWith(settings);
  });
});
