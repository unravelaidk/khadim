import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { OpenCodeServerManager } from "../../../src/main/plugins/opencode-server-manager";

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  Object.assign(child, {
    pid: 42,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: null,
    stdio: [null, null, null, null, null],
    connected: false,
    killed: false,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: "/fake/opencode",
    kill: vi.fn(() => true),
    send: vi.fn(() => false),
    disconnect: vi.fn(),
    ref: vi.fn(),
    unref: vi.fn(),
  });
  return child;
}

describe("managed OpenCode server", () => {
  it("spawns a scoped loopback server when no external URL is configured", async () => {
    const child = fakeChild();
    const spawnProcess = vi.fn((_command: string, _args: ReadonlyArray<string>, _options: SpawnOptions) => {
      queueMicrotask(() => child.stdout?.emit("data", Buffer.from("opencode server listening on http://127.0.0.1:43123\n")));
      return child;
    });
    const terminate = vi.fn(async () => undefined);
    const manager = new OpenCodeServerManager({
      spawnProcess,
      allocatePort: async () => 43123,
      terminate,
      startupTimeoutMs: 1_000,
    });

    const config = await manager.prepare({
      pluginId: "khadim.opencode",
      bundled: true,
      engineSessionKey: "chat-one",
      config: { baseUrl: "", binaryPath: "/fake/opencode" },
      nativeToolMcp: { url: "http://127.0.0.1:45555/mcp", token: "run-secret", hasTools: true },
    });

    expect(config.baseUrl).toBe("http://127.0.0.1:43123");
    expect(spawnProcess).toHaveBeenCalledWith(
      "/fake/opencode",
      ["serve", "--hostname=127.0.0.1", "--port=43123"],
      expect.objectContaining({ detached: process.platform !== "win32" }),
    );
    expect(JSON.parse((spawnProcess.mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv }).env?.OPENCODE_CONFIG_CONTENT ?? "{}"))
      .toEqual({ mcp: { khadim: {
        type: "remote",
        url: "http://127.0.0.1:45555/mcp",
        enabled: true,
        oauth: false,
        headers: { Authorization: "Bearer run-secret" },
      } } });

    await manager.stopAll();
    expect(terminate).toHaveBeenCalledWith(child);
  });

  it("reuses a managed server per chat and leaves external URLs alone", async () => {
    const child = fakeChild();
    const spawnProcess = vi.fn((_command: string, _args: ReadonlyArray<string>, _options: SpawnOptions) => {
      queueMicrotask(() => child.stdout?.emit("data", Buffer.from("opencode server listening on http://127.0.0.1:43124\n")));
      return child;
    });
    const terminate = vi.fn(async () => undefined);
    const manager = new OpenCodeServerManager({
      spawnProcess,
      allocatePort: async () => 43124,
      terminate,
    });
    const local = {
      pluginId: "khadim.opencode",
      bundled: true,
      engineSessionKey: "chat-one",
      config: { binaryPath: "/fake/opencode", baseUrl: "http://127.0.0.1:4096" },
    };

    await Promise.all([manager.prepare(local), manager.prepare(local)]);
    const external = await manager.prepare({ ...local, engineSessionKey: "chat-two", config: { baseUrl: "https://example.test" } });

    expect(spawnProcess).toHaveBeenCalledOnce();
    expect(external.baseUrl).toBe("https://example.test");
    await expect(manager.prepare({
      ...local,
      engineSessionKey: "chat-three",
      config: { baseUrl: "https://example.test" },
      nativeToolMcp: { url: "http://127.0.0.1:45555/mcp", token: "run-secret", hasTools: true },
    })).rejects.toThrow("Clear Server URL in Apps");
    await manager.stop("chat-one");
    expect(terminate).toHaveBeenCalledWith(child);
    await manager.stopAll();
  });

  it("reports a missing OpenCode binary with a setup action", async () => {
    const child = fakeChild();
    const spawnProcess = vi.fn((_command: string, _args: ReadonlyArray<string>, _options: SpawnOptions) => {
      queueMicrotask(() => child.emit("error", Object.assign(new Error("spawn opencode ENOENT"), { code: "ENOENT" })));
      return child;
    });
    const manager = new OpenCodeServerManager({
      spawnProcess,
      allocatePort: async () => 43125,
      terminate: async () => undefined,
      startupTimeoutMs: 1_000,
    });

    await expect(manager.prepare({
      pluginId: "khadim.opencode",
      bundled: true,
      engineSessionKey: "chat-one",
      config: { binaryPath: "opencode" },
    })).rejects.toThrow("Install OpenCode");
  });
});
