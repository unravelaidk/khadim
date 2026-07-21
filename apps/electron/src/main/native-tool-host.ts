import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";

const defaultMaxRequestBytes = 768_000;
const toolNamePattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export interface NativeToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  prompt_snippet?: string;
}

export interface NativeToolResult {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface NativeTool {
  definition: NativeToolDefinition;
  execute: (input: Record<string, unknown>) => Promise<NativeToolResult>;
}

export interface NativeToolHost {
  env: Record<string, string>;
  close: () => Promise<void>;
}

export class NativeToolError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 413 | 429 | 500 | 502 | 503,
    message: string,
  ) {
    super(message);
    this.name = "NativeToolError";
  }
}

class RequestTooLargeError extends Error {}

async function requestBody(
  request: IncomingMessage,
  maxRequestBytes: number,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxRequestBytes) throw new RequestTooLargeError();
    chunks.push(buffer);
  }

  let parsed: { input?: unknown };
  try {
    parsed = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")) as { input?: unknown };
  } catch {
    throw new NativeToolError(400, "Native tool request must be valid JSON.");
  }
  return parsed.input && typeof parsed.input === "object" && !Array.isArray(parsed.input)
    ? parsed.input as Record<string, unknown>
    : {};
}

function validateTools(tools: readonly NativeTool[]): string {
  if (tools.length === 0) throw new Error("A native tool host requires at least one tool.");
  const names = new Set<string>();
  for (const tool of tools) {
    const { name } = tool.definition;
    if (!toolNamePattern.test(name)) {
      throw new Error(`Native tool name ${JSON.stringify(name)} must match ${toolNamePattern}.`);
    }
    if (names.has(name)) throw new Error(`Duplicate native tool name: ${name}.`);
    names.add(name);
  }
  try {
    return JSON.stringify(tools.map((tool) => tool.definition));
  } catch {
    throw new Error("Native tool definitions must be JSON serializable.");
  }
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    try {
      server.listen(0, "127.0.0.1");
    } catch (cause) {
      cleanup();
      reject(cause);
    }
  });
}

export async function createNativeToolHost(
  tools: readonly NativeTool[],
  options: { maxRequestBytes?: number } = {},
): Promise<NativeToolHost> {
  const definitions = validateTools(tools);
  const maxRequestBytes = options.maxRequestBytes ?? defaultMaxRequestBytes;
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1) {
    throw new Error("Native tool request limit must be a positive integer.");
  }

  const toolsByName = new Map(tools.map((tool) => [tool.definition.name, tool]));
  const token = randomBytes(24).toString("hex");
  const sockets = new Set<Socket>();
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST") {
        response.writeHead(405).end("method not allowed");
        return;
      }
      if (request.headers.authorization !== `Bearer ${token}`) {
        response.writeHead(401).end("unauthorized");
        return;
      }
      const match = request.url?.match(/^\/tool\/([A-Za-z][A-Za-z0-9_-]{0,63})$/);
      const tool = match ? toolsByName.get(match[1]) : undefined;
      if (!tool) {
        response.writeHead(404).end("tool not found");
        return;
      }
      const result = await tool.execute(await requestBody(request, maxRequestBytes));
      const body = JSON.stringify(result);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(body);
    } catch (cause) {
      const status = cause instanceof RequestTooLargeError
        ? 413
        : cause instanceof NativeToolError
          ? cause.status
          : 500;
      const content = cause instanceof RequestTooLargeError
        ? "Native tool request is too large."
        : cause instanceof NativeToolError
          ? cause.message
          : "Native tool failed.";
      response.writeHead(status, { "content-type": "application/json", connection: "close" });
      response.end(JSON.stringify({ content }));
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  await listen(server);
  const address = server.address() as AddressInfo | null;
  if (!address) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("The native tool host could not start.");
  }

  let closePromise: Promise<void> | null = null;
  return {
    env: {
      KHADIM_NATIVE_TOOL_RPC_URL: `http://127.0.0.1:${address.port}`,
      KHADIM_NATIVE_TOOL_RPC_TOKEN: token,
      KHADIM_NATIVE_TOOLS: definitions,
    },
    close: () => {
      closePromise ??= new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections?.();
      });
      return closePromise;
    },
  };
}
