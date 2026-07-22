import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { PluginHarnessCatalog, PluginHarnessMode, PluginHarnessModel } from "../../shared/plugins";
import { terminateProcessTree } from "../process-lifecycle";

type SpawnProcess = (
  command: string,
  args: ReadonlyArray<string>,
  options: SpawnOptions,
) => ChildProcess;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (cause: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface CodexAppServerCatalogClientOptions {
  spawnProcess?: SpawnProcess;
  terminate?: (child: ChildProcess) => Promise<void>;
  requestTimeoutMs?: number;
}

export interface CodexCatalogDiscoveryInput {
  binary: string;
  cwd: string;
  environment: NodeJS.ProcessEnv;
}

const outputLimit = 8 * 1024 * 1024;
const maximumPages = 100;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function modelsFromPage(value: unknown): PluginHarnessModel[] {
  const page = record(value);
  const entries = Array.isArray(page?.data) ? page.data : [];
  return entries.flatMap((entry) => {
    const model = record(entry);
    if (!model || model.hidden === true) return [];
    const id = typeof model.id === "string" && model.id.trim()
      ? model.id.trim()
      : typeof model.model === "string" ? model.model.trim() : "";
    const nativeModel = typeof model.model === "string" && model.model.trim()
      ? model.model.trim()
      : id;
    if (!id || !nativeModel) return [];
    const name = typeof model.displayName === "string" && model.displayName.trim()
      ? model.displayName.trim()
      : nativeModel;
    const description = typeof model.description === "string" && model.description.trim()
      ? model.description.trim()
      : undefined;
    return [{
      id,
      name,
      provider: "openai",
      model: nativeModel,
      ...(description ? { detail: description } : {}),
      isDefault: model.isDefault === true,
    }];
  });
}

function modesFromResponse(value: unknown): PluginHarnessMode[] {
  const response = record(value);
  const entries = Array.isArray(response?.data) ? response.data : [];
  const modes = entries.flatMap((entry) => {
    const mode = record(entry);
    const id = typeof mode?.mode === "string" ? mode.mode.trim() : "";
    const name = typeof mode?.name === "string" ? mode.name.trim() : "";
    if (!id || !name) return [];
    const effort = typeof mode?.reasoning_effort === "string" && mode.reasoning_effort.trim()
      ? mode.reasoning_effort.trim()
      : undefined;
    return [{
      id,
      name,
      ...(effort ? { description: `${effort[0]?.toUpperCase() ?? ""}${effort.slice(1)} reasoning` } : {}),
      isDefault: id === "default",
    }];
  });
  return modes.length > 0 ? modes : [{ id: "default", name: "Default", isDefault: true }];
}

export class CodexAppServerCatalogClient {
  readonly #spawn: SpawnProcess;
  readonly #terminate: (child: ChildProcess) => Promise<void>;
  readonly #requestTimeoutMs: number;

  constructor(options: CodexAppServerCatalogClientOptions = {}) {
    this.#spawn = options.spawnProcess ?? ((command, args, spawnOptions) => (
      spawn(command, [...args], spawnOptions)
    ));
    this.#terminate = options.terminate ?? (async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
      await terminateProcessTree(child, closed, { graceMs: 500, deadlineMs: 3_000 });
    });
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  }

  async discover(input: CodexCatalogDiscoveryInput): Promise<PluginHarnessCatalog> {
    const child = this.#spawn(input.binary, ["app-server"], {
      cwd: input.cwd,
      env: input.environment,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    let nextId = 1;
    let stdoutBuffer = "";
    let stderr = "";
    let closedError: Error | null = null;
    const pending = new Map<number, PendingRequest>();

    const rejectPending = (cause: Error): void => {
      closedError = cause;
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(cause);
      }
      pending.clear();
    };
    const consume = (chunk: Buffer | string): void => {
      stdoutBuffer += chunk.toString();
      if (stdoutBuffer.length > outputLimit) {
        rejectPending(new Error("Codex model catalog output exceeded 8 MB."));
        return;
      }
      let newline = stdoutBuffer.indexOf("\n");
      while (newline >= 0) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (line) {
          try {
            const message = JSON.parse(line) as Record<string, unknown>;
            if (typeof message.id === "number") {
              const waiting = pending.get(message.id);
              if (waiting) {
                pending.delete(message.id);
                clearTimeout(waiting.timer);
                if (message.error) waiting.reject(new Error(JSON.stringify(message.error)));
                else waiting.resolve(message.result);
              }
            }
          } catch {
            // Non-protocol diagnostics are ignored; stderr is retained for errors.
          }
        }
        newline = stdoutBuffer.indexOf("\n");
      }
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-64 * 1024);
    });
    child.once("error", (cause) => rejectPending(cause));
    child.once("close", (code) => rejectPending(new Error(
      stderr.trim() || `Codex app-server exited with code ${String(code)}.`,
    )));

    const write = (message: unknown): void => {
      if (!child.stdin?.writable) throw closedError ?? new Error("Codex app-server input is unavailable.");
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };
    const request = (method: string, params: Record<string, unknown>): Promise<unknown> => {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Codex ${method} timed out after ${this.#requestTimeoutMs / 1_000} seconds.`));
        }, this.#requestTimeoutMs);
        pending.set(id, { resolve, reject, timer });
        try { write({ jsonrpc: "2.0", id, method, params }); }
        catch (cause) {
          clearTimeout(timer);
          pending.delete(id);
          reject(cause);
        }
      });
    };

    try {
      await request("initialize", {
        clientInfo: { name: "khadim", title: "Khadim", version: "0.1.0" },
        capabilities: { experimentalApi: true },
      });
      write({ jsonrpc: "2.0", method: "initialized", params: {} });
      const models: PluginHarnessModel[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | undefined;
      for (let pageIndex = 0; pageIndex < maximumPages; pageIndex += 1) {
        const page = await request("model/list", {
          limit: 100,
          includeHidden: false,
          ...(cursor ? { cursor } : {}),
        });
        models.push(...modelsFromPage(page));
        const nextCursor = record(page)?.nextCursor;
        if (typeof nextCursor !== "string" || !nextCursor.trim()) break;
        cursor = nextCursor.trim();
        if (seenCursors.has(cursor)) throw new Error("Codex model catalog repeated a pagination cursor.");
        seenCursors.add(cursor);
      }
      if (models.length === 0) throw new Error("Codex app-server did not report any visible models.");
      const modeResponse = await request("collaborationMode/list", {}).catch(() => null);
      return { models, modes: modesFromResponse(modeResponse) };
    } finally {
      for (const waiting of pending.values()) clearTimeout(waiting.timer);
      pending.clear();
      await this.#terminate(child);
    }
  }
}
