/**
 * @khadim/codeexecution-client
 *
 * Client SDK for interacting with a remote code execution server.
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type {
  CodeExecutionClient,
  CodeExecutionClientOptions,
  CreateSandboxOptions,
  ExecResult,
  RemoteSandbox,
  SpawnResult,
} from "./types";

type TrpcSandboxApi = {
  create: { mutate: (input: { lifetime: string }) => Promise<{ id: string; containerId: string }> };
  connect: { mutate: (input: { id: string }) => Promise<{ id: string; containerId: string }> };
  list: { query: () => Promise<{ id: string }[]> };
  writeFile: {
    mutate: (input: { sandboxId: string; path: string; content: string }) => Promise<unknown>;
  };
  readFile: {
    query: (input: { sandboxId: string; path: string }) => Promise<{ content: string }>;
  };
  exec: {
    mutate: (input: { sandboxId: string; script: string }) => Promise<ExecResult>;
  };
  spawn: {
    mutate: (input: {
      sandboxId: string;
      command: string[];
      options?: { cwd?: string; env?: Record<string, string> };
    }) => Promise<SpawnResult>;
  };
  exposeHttp: {
    mutate: (input: { sandboxId: string; port: number }) => Promise<{ url: string } | string>;
  };
  kill: { mutate: (input: { sandboxId: string }) => Promise<void> };
};

export function createCodeExecutionClient(
  options: CodeExecutionClientOptions
): CodeExecutionClient {
  const { url, token } = options;

  const trpc = createTRPCClient<any>({
    links: [
      httpBatchLink({
        url: `${url}/trpc`,
        transformer: superjson,
        headers: token
          ? () => ({
              Authorization: `Bearer ${token}`,
            })
          : undefined,
      }),
    ],
  });

  const sandboxApi = trpc.sandbox as TrpcSandboxApi;

  function createRemoteSandbox(id: string, containerId: string): RemoteSandbox {
    return {
      id,
      containerId,
      async writeFile(path: string, content: string): Promise<void> {
        await sandboxApi.writeFile.mutate({ sandboxId: id, path, content });
      },
      async readFile(path: string): Promise<string> {
        const result = await sandboxApi.readFile.query({ sandboxId: id, path });
        return result.content;
      },
      async exec(script: string): Promise<ExecResult> {
        return await sandboxApi.exec.mutate({ sandboxId: id, script });
      },
      async spawn(
        command: string[],
        options?: { cwd?: string; env?: Record<string, string> }
      ): Promise<SpawnResult> {
        return await sandboxApi.spawn.mutate({ sandboxId: id, command, options });
      },
      async exposeHttp(options: { port: number }): Promise<string> {
        const result = await sandboxApi.exposeHttp.mutate({ sandboxId: id, port: options.port });
        return typeof result === "string" ? result : result.url;
      },
      async kill(): Promise<void> {
        await sandboxApi.kill.mutate({ sandboxId: id });
      },
      async writeTextFile(path: string, content: string): Promise<void> {
        await sandboxApi.writeFile.mutate({ sandboxId: id, path, content });
      },
      async readTextFile(path: string): Promise<string> {
        const result = await sandboxApi.readFile.query({ sandboxId: id, path });
        return result.content;
      },
    };
  }

  return {
    sandbox: {
      async create(options?: CreateSandboxOptions): Promise<RemoteSandbox> {
        const result = await sandboxApi.create.mutate({
          lifetime: options?.lifetime ?? "15m",
        });
        return createRemoteSandbox(result.id, result.containerId);
      },
      async connect(id: string): Promise<RemoteSandbox> {
        const result = await sandboxApi.connect.mutate({ id });
        return createRemoteSandbox(result.id, result.containerId);
      },
      async list(): Promise<{ id: string }[]> {
        return await sandboxApi.list.query();
      },
    },
  };
}

export type {
  CodeExecutionClient,
  CodeExecutionClientOptions,
  CreateSandboxOptions,
  ExecResult,
  RemoteSandbox,
  SpawnResult,
} from "./types";
