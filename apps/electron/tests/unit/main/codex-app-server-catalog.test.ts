import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { CodexAppServerCatalogClient } from "../../../src/main/plugins/codex-app-server-catalog";

function fakeCodexAppServer(): ChildProcess {
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
      const request = JSON.parse(line) as {
        id?: number;
        method?: string;
        params?: Record<string, unknown>;
      };
      const write = (value: unknown) => stdout.emit("data", `${JSON.stringify(value)}\n`);
      if (request.method === "initialize") {
        write({ id: request.id, result: { userAgent: "codex-cli/0.144.6" } });
      }
      if (request.method === "model/list" && !request.params?.cursor) {
        write({
          id: request.id,
          result: {
            data: [{
              id: "gpt-5.6-sol",
              model: "gpt-5.6-sol",
              displayName: "GPT-5.6-Sol",
              description: "Latest frontier agentic coding model.",
              isDefault: true,
            }],
            nextCursor: "page-two",
          },
        });
      }
      if (request.method === "model/list" && request.params?.cursor === "page-two") {
        write({
          id: request.id,
          result: {
            data: [{
              id: "gpt-5.5",
              model: "gpt-5.5",
              displayName: "GPT-5.5",
              isDefault: false,
            }],
            nextCursor: null,
          },
        });
      }
      if (request.method === "collaborationMode/list") {
        write({
          id: request.id,
          result: {
            data: [
              { name: "Plan", mode: "plan", reasoning_effort: "medium" },
              { name: "Default", mode: "default", reasoning_effort: null },
            ],
          },
        });
      }
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
  });
  return child;
}

describe("CodexAppServerCatalogClient", () => {
  it("discovers every visible model page and collaboration mode", async () => {
    const child = fakeCodexAppServer();
    const spawnProcess = vi.fn(() => child);
    const client = new CodexAppServerCatalogClient({
      spawnProcess,
      terminate: async () => { child.emit("close", 0, null); },
    });

    await expect(client.discover({
      binary: "/fake/codex",
      cwd: "/workspace/project",
      environment: { PATH: "/bin" },
    })).resolves.toEqual({
      models: [
        {
          id: "gpt-5.6-sol",
          name: "GPT-5.6-Sol",
          provider: "openai",
          model: "gpt-5.6-sol",
          detail: "Latest frontier agentic coding model.",
          isDefault: true,
        },
        {
          id: "gpt-5.5",
          name: "GPT-5.5",
          provider: "openai",
          model: "gpt-5.5",
          isDefault: false,
        },
      ],
      modes: [
        { id: "plan", name: "Plan", description: "Medium reasoning", isDefault: false },
        { id: "default", name: "Default", isDefault: true },
      ],
    });
    expect(spawnProcess).toHaveBeenCalledWith(
      "/fake/codex",
      ["app-server"],
      expect.objectContaining({ cwd: "/workspace/project" }),
    );
  });
});
