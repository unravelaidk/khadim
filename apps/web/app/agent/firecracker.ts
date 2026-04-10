import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { SandboxProvider } from "./sandbox-types";

type FirecrackerSandboxControlPlaneOptions = {
  baseUrl: string;
  token?: string;
  vmDefaults?: {
    vcpuCount?: number;
    memoryMib?: number;
    kernelImage?: string;
    rootfsImage?: string;
    snapshotId?: string;
    networkPolicy?: string;
  };
};

type FirecrackerSandboxRecord = {
  id: string;
  containerId?: string;
};

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function shouldUseNativeFetch(): boolean {
  return Boolean(process.env.VITEST);
}

async function requestJson<T>(
  urlString: string,
  init: RequestInit,
  token?: string
): Promise<{ status: number; bodyText: string; json?: T }> {
  if (shouldUseNativeFetch()) {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(urlString, { ...init, headers });
    const bodyText = await response.text();
    return {
      status: response.status,
      bodyText,
      json: bodyText ? (JSON.parse(bodyText) as T) : undefined,
    };
  }

  const url = new URL(urlString);
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  const rawHeaders = init.headers instanceof Headers
    ? Object.fromEntries(init.headers.entries())
    : Array.isArray(init.headers)
      ? Object.fromEntries(init.headers)
      : ((init.headers as Record<string, string> | undefined) ?? {});
  for (const [key, value] of Object.entries(rawHeaders)) {
    headers[key] = String(value);
  }

  const body = typeof init.body === "string" ? init.body : undefined;
  if (body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["content-type"] = "application/json";
  }
  if (body !== undefined) {
    headers["content-length"] = String(Buffer.byteLength(body));
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    const request = transport(
      url,
      {
        method: init.method,
        headers,
      },
      (response: IncomingMessage) => {
        let bodyText = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          bodyText += chunk;
        });
        response.on("end", () => {
          try {
            resolve({
              status: response.statusCode ?? 500,
              bodyText,
              json: bodyText ? (JSON.parse(bodyText) as T) : undefined,
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    if (body !== undefined) {
      request.write(body);
    }
    request.end();
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toSandboxRecord(value: unknown): FirecrackerSandboxRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Firecracker control plane returned an invalid sandbox response");
  }

  const record = value as Record<string, unknown>;
  const id = asString(record.id) ?? asString(record.sandboxId);
  if (!id) {
    throw new Error("Firecracker control plane response is missing a sandbox id");
  }

  return {
    id,
    containerId:
      asString(record.containerId) ??
      asString(record.vmId) ??
      asString(record.microvmId),
  };
}

function toExecResult(value: unknown): { exitCode: number; stdout: string; stderr: string } {
  if (!value || typeof value !== "object") {
    throw new Error("Firecracker command response was invalid");
  }

  const record = value as Record<string, unknown>;
  return {
    exitCode: asNumber(record.exitCode) ?? asNumber(record.exit_code) ?? asNumber(record.code) ?? 1,
    stdout: asString(record.stdout) ?? "",
    stderr: asString(record.stderr) ?? "",
  };
}

function toSpawnResult(value: unknown): { pid: number } {
  if (!value || typeof value !== "object") {
    throw new Error("Firecracker process response was invalid");
  }

  const record = value as Record<string, unknown>;
  const pid = asNumber(record.pid);
  if (pid === undefined) {
    throw new Error("Firecracker process response is missing a pid");
  }

  return { pid };
}

function toTextFile(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    throw new Error("Firecracker file response was invalid");
  }

  const record = value as Record<string, unknown>;
  return asString(record.content) ?? "";
}

function toExposedUrl(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    throw new Error("Firecracker expose response was invalid");
  }

  const record = value as Record<string, unknown>;
  const url = asString(record.url);
  if (!url) {
    throw new Error("Firecracker expose response is missing a url");
  }

  return url;
}

export function createFirecrackerSandboxProvider(
  options: FirecrackerSandboxControlPlaneOptions
): SandboxProvider {
  const baseUrl = trimTrailingSlash(options.baseUrl);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await requestJson<T>(`${baseUrl}${path}`, init ?? {}, options.token);

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        response.bodyText || `Firecracker control plane request failed with ${response.status}`
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json as T;
  }

  function wrapSandbox(record: FirecrackerSandboxRecord) {
    return {
      id: record.id,
      containerId: record.containerId,
      async writeFile(path: string, content: string): Promise<void> {
        await request<void>(
          `/v1/sandboxes/${record.id}/files?path=${encodeURIComponent(path)}`,
          {
            method: "PUT",
            body: JSON.stringify({ content, encoding: "utf8" }),
          }
        );
      },
      async readFile(path: string): Promise<string> {
        const result = await request<unknown>(
          `/v1/sandboxes/${record.id}/files?path=${encodeURIComponent(path)}`
        );
        return toTextFile(result);
      },
      async exec(script: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
        const result = await request<unknown>(`/v1/sandboxes/${record.id}/commands`, {
          method: "POST",
          body: JSON.stringify({ mode: "shell", script }),
        });
        return toExecResult(result);
      },
      async spawn(
        command: string[],
        spawnOptions?: { cwd?: string; env?: Record<string, string> }
      ): Promise<{ pid: number }> {
        const result = await request<unknown>(`/v1/sandboxes/${record.id}/processes`, {
          method: "POST",
          body: JSON.stringify({ command, ...spawnOptions }),
        });
        return toSpawnResult(result);
      },
      async exposeHttp(exposeOptions: { port: number }): Promise<string> {
        const result = await request<unknown>(`/v1/sandboxes/${record.id}/network/expose`, {
          method: "POST",
          body: JSON.stringify({ port: exposeOptions.port }),
        });
        return toExposedUrl(result);
      },
      async kill(): Promise<void> {
        await request<void>(`/v1/sandboxes/${record.id}`, { method: "DELETE" });
      },
    };
  }

  return {
    async create(createOptions: { lifetime: string }) {
      const vmDefaults = {
        vcpuCount: options.vmDefaults?.vcpuCount,
        memoryMib: options.vmDefaults?.memoryMib,
        kernelImage: options.vmDefaults?.kernelImage,
        rootfsImage: options.vmDefaults?.rootfsImage,
        snapshotId: options.vmDefaults?.snapshotId,
        networkPolicy: options.vmDefaults?.networkPolicy,
      };

      const result = await request<unknown>("/v1/sandboxes", {
        method: "POST",
        body: JSON.stringify({
          lifetime: createOptions.lifetime,
          substrate: "firecracker",
          vm: Object.fromEntries(
            Object.entries(vmDefaults).filter(([, value]) => value !== undefined && value !== "")
          ),
        }),
      });

      return wrapSandbox(toSandboxRecord(result));
    },
    async connect(connectOptions: { id: string }) {
      const result = await request<unknown>(`/v1/sandboxes/${connectOptions.id}`);
      return wrapSandbox(toSandboxRecord(result));
    },
  };
}

export type { FirecrackerSandboxControlPlaneOptions };
