import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { constants, accessSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { delimiter, extname, join } from "node:path";
import { terminateProcessTree } from "../process-lifecycle";

export interface PrepareOpenCodeInput {
  pluginId: string;
  bundled: boolean;
  engineSessionKey: string;
  config: Record<string, string | number | boolean>;
}

interface ManagedServer {
  child?: ChildProcess;
  start: Promise<string>;
}

type SpawnProcess = (command: string, args: ReadonlyArray<string>, options: SpawnOptions) => ChildProcess;

export interface OpenCodeServerManagerOptions {
  spawnProcess?: SpawnProcess;
  allocatePort?: () => Promise<number>;
  terminate?: (child: ChildProcess) => Promise<void>;
  startupTimeoutMs?: number;
}

const readyPrefix = "opencode server listening";
const legacyDefaultServerUrl = "http://127.0.0.1:4096";
const outputLimit = 16 * 1024;

function appendBounded(current: string, chunk: string): string {
  const next = `${current}${chunk}`;
  return next.length <= outputLimit ? next : next.slice(-outputLimit);
}

function executable(path: string): boolean {
  try {
    accessSync(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandExtensions(command: string): string[] {
  if (process.platform !== "win32" || extname(command)) return [""];
  return (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").map((value) => value.toLowerCase());
}

function resolveBinary(configured: string): string {
  const value = configured.trim() || "opencode";
  const expanded = value.startsWith("~/") || value.startsWith("~\\") ? join(homedir(), value.slice(2)) : value;
  if (expanded.includes("/") || expanded.includes("\\")) return expanded;
  const extensions = commandExtensions(expanded);
  const directories = [
    ...(process.env.PATH ?? "").split(delimiter),
    join(homedir(), ".opencode", "bin"),
    join(homedir(), ".local", "bin"),
    join(homedir(), ".bun", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  for (const directory of directories) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, `${expanded}${extension}`);
      if (existsSync(candidate) && executable(candidate)) return candidate;
    }
  }
  return expanded;
}

function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a loopback port for OpenCode."));
        return;
      }
      server.close((cause) => cause ? reject(cause) : resolvePort(address.port));
    });
  });
}

async function terminateManagedProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolveClose) => child.once("close", () => resolveClose()));
  await terminateProcessTree(child, closed, { graceMs: 1_000, deadlineMs: 5_000 });
}

function startupFailure(cause: unknown, stderr = ""): Error {
  const error = cause as NodeJS.ErrnoException;
  if (error?.code === "ENOENT" || error?.message?.includes("ENOENT")) {
    return new Error("OpenCode CLI was not found. Install OpenCode and run `opencode auth login`, or set the plugin’s Binary path in Apps.");
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`OpenCode server could not start: ${detail}${stderr.trim() ? `\n${stderr.trim()}` : ""}`);
}

export class OpenCodeServerManager {
  readonly #servers = new Map<string, ManagedServer>();
  readonly #spawn: SpawnProcess;
  readonly #allocatePort: () => Promise<number>;
  readonly #terminate: (child: ChildProcess) => Promise<void>;
  readonly #startupTimeoutMs: number;
  #stopping = false;

  constructor(options: OpenCodeServerManagerOptions = {}) {
    this.#spawn = options.spawnProcess ?? ((command, args, spawnOptions) => spawn(command, [...args], spawnOptions));
    this.#allocatePort = options.allocatePort ?? allocateLoopbackPort;
    this.#terminate = options.terminate ?? terminateManagedProcess;
    this.#startupTimeoutMs = options.startupTimeoutMs ?? 30_000;
  }

  async prepare(input: PrepareOpenCodeInput): Promise<Record<string, string | number | boolean>> {
    if (input.pluginId !== "khadim.opencode" || !input.bundled) return input.config;
    const externalUrl = typeof input.config.baseUrl === "string" ? input.config.baseUrl.trim() : "";
    // v0.1 exposed port 4096 as a manifest default, so it may have been saved
    // even when the user never chose an externally managed server. Migrate
    // that one historical value to the v0.2 blank-means-managed behavior.
    if (externalUrl && externalUrl.replace(/\/$/, "") !== legacyDefaultServerUrl) {
      return { ...input.config, baseUrl: externalUrl };
    }
    if (this.#stopping) throw new Error("Khadim is shutting down and cannot start OpenCode.");

    let managed = this.#servers.get(input.engineSessionKey);
    if (!managed) {
      managed = { start: Promise.resolve("") };
      managed.start = this.#start(input, managed).catch((cause) => {
        if (this.#servers.get(input.engineSessionKey) === managed) this.#servers.delete(input.engineSessionKey);
        throw cause;
      });
      this.#servers.set(input.engineSessionKey, managed);
    }
    return { ...input.config, baseUrl: await managed.start };
  }

  async stopAll(): Promise<void> {
    this.#stopping = true;
    const managed = [...this.#servers.entries()];
    this.#servers.clear();
    await Promise.allSettled(managed.map(([, server]) => this.#stopManaged(server)));
  }

  async stop(engineSessionKey: string): Promise<void> {
    const managed = this.#servers.get(engineSessionKey);
    if (!managed) return;
    this.#servers.delete(engineSessionKey);
    await this.#stopManaged(managed);
  }

  async #start(input: PrepareOpenCodeInput, managed: ManagedServer): Promise<string> {
    const port = await this.#allocatePort();
    if (this.#stopping) throw new Error("Khadim is shutting down and cannot start OpenCode.");
    const configuredBinary = typeof input.config.binaryPath === "string" ? input.config.binaryPath : "opencode";
    if (configuredBinary.includes("\0") || configuredBinary.length > 4_096) throw new Error("OpenCode Binary path is invalid.");
    const binary = resolveBinary(configuredBinary);
    const environment: NodeJS.ProcessEnv = { ...process.env, OPENCODE_CONFIG_CONTENT: "{}" };
    if (typeof input.config.password === "string" && input.config.password) environment.OPENCODE_SERVER_PASSWORD = input.config.password;
    if (typeof input.config.username === "string" && input.config.username) environment.OPENCODE_SERVER_USERNAME = input.config.username;
    let child: ChildProcess;
    try {
      child = this.#spawn(binary, ["serve", "--hostname=127.0.0.1", `--port=${port}`], {
        detached: process.platform !== "win32",
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (cause) {
      throw startupFailure(cause);
    }
    managed.child = child;

    try {
      return await new Promise<string>((resolveReady, reject) => {
        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = (operation: () => void): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          operation();
        };
        const timer = setTimeout(() => finish(() => reject(new Error(
          `Timed out waiting for OpenCode server start after ${this.#startupTimeoutMs}ms.${stderr.trim() ? `\n${stderr.trim()}` : ""}`,
        ))), this.#startupTimeoutMs);
        child.stdout?.on("data", (chunk: Buffer | string) => {
          stdout = appendBounded(stdout, chunk.toString());
          const line = stdout.split(/\r?\n/).find((candidate) => candidate.trimStart().startsWith(readyPrefix));
          const match = line?.match(/on\s+(https?:\/\/[^\s]+)/);
          if (!match?.[1]) return;
          try {
            const url = new URL(match[1]);
            if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") throw new Error("OpenCode reported a non-loopback server URL.");
            finish(() => resolveReady(url.origin));
          } catch (cause) {
            finish(() => reject(cause));
          }
        });
        child.stderr?.on("data", (chunk: Buffer | string) => { stderr = appendBounded(stderr, chunk.toString()); });
        child.once("error", (cause) => finish(() => reject(startupFailure(cause, stderr))));
        child.once("exit", (code, signal) => {
          if (this.#servers.get(input.engineSessionKey) === managed) this.#servers.delete(input.engineSessionKey);
          finish(() => reject(new Error(
            `OpenCode server exited before startup completed (${signal ? `signal ${signal}` : `code ${String(code)}`}).${stderr.trim() ? `\n${stderr.trim()}` : ""}`,
          )));
        });
      });
    } catch (cause) {
      await this.#terminate(child).catch(() => undefined);
      throw startupFailure(cause);
    }
  }

  async #stopManaged(managed: ManagedServer): Promise<void> {
    await managed.start.catch(() => undefined);
    if (managed.child) await this.#terminate(managed.child);
  }
}
