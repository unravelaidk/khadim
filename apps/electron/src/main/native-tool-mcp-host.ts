import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, isInitializeRequest, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { NativeToolError, type NativeTool } from "./native-tool-host";

const maxRequestBytes = 768_000;
const toolNamePattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export interface NativeToolMcpEndpoint {
  url: string;
  token: string;
  hasTools: boolean;
}

interface McpConnection {
  server: Server;
  transport: StreamableHTTPServerTransport;
}

interface ManagedNativeToolMcpHost {
  http: HttpServer;
  sockets: Set<Socket>;
  origin: string;
  token: string;
  tools: Map<string, NativeTool>;
  connections: Map<string, McpConnection>;
}

function jsonRpcError(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > maxRequestBytes) throw new NativeToolError(413, "MCP request is too large.");
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxRequestBytes) throw new NativeToolError(413, "MCP request is too large.");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")) as unknown;
  } catch {
    throw new NativeToolError(400, "MCP request must be valid JSON.");
  }
}

function validateTools(tools: readonly NativeTool[]): Map<string, NativeTool> {
  const result = new Map<string, NativeTool>();
  for (const tool of tools) {
    const { name } = tool.definition;
    if (!toolNamePattern.test(name)) throw new Error(`Native tool name ${JSON.stringify(name)} is invalid.`);
    if (result.has(name)) throw new Error(`Duplicate native tool name: ${name}.`);
    JSON.stringify(tool.definition);
    result.set(name, tool);
  }
  return result;
}

function createMcpServer(host: ManagedNativeToolMcpHost): Server {
  const server = new Server(
    { name: "khadim-native-tools", version: "1.0.0" },
    {
      capabilities: { tools: { listChanged: true } },
      instructions: "These tools are scoped by Khadim to the selected Studio artifact and connected apps enabled for the current run.",
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...host.tools.values()].map(({ definition }) => ({
      name: definition.name,
      description: definition.description,
      inputSchema: definition.parameters as { type: "object"; properties?: Record<string, unknown> },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = host.tools.get(request.params.name);
    if (!tool) return { content: [{ type: "text" as const, text: "This tool is not enabled for the current run." }], isError: true };
    try {
      const input = request.params.arguments && typeof request.params.arguments === "object" && !Array.isArray(request.params.arguments)
        ? request.params.arguments
        : {};
      const result = await tool.execute(input);
      return {
        content: [{ type: "text" as const, text: result.content }],
        ...(result.metadata ? { structuredContent: result.metadata } : {}),
      };
    } catch (cause) {
      return {
        content: [{ type: "text" as const, text: cause instanceof NativeToolError ? cause.message : "Native tool failed." }],
        isError: true,
      };
    }
  });
  return server;
}

function listen(server: HttpServer): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address() as AddressInfo | null;
      if (!address) return reject(new Error("Native MCP host did not receive a loopback address."));
      server.unref();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

export class NativeToolMcpHostManager {
  readonly #hosts = new Map<string, ManagedNativeToolMcpHost>();

  async prepare(engineSessionKey: string, tools: readonly NativeTool[]): Promise<NativeToolMcpEndpoint> {
    const nextTools = validateTools(tools);
    let host = this.#hosts.get(engineSessionKey);
    if (!host) {
      const token = randomBytes(32).toString("hex");
      let created!: ManagedNativeToolMcpHost;
      const http = createServer((request, response) => void this.#handle(created, request, response).catch((cause) => {
        if (!response.headersSent) {
          const status = cause instanceof NativeToolError ? cause.status : 500;
          jsonRpcError(response, status, cause instanceof NativeToolError ? cause.message : "Native MCP request failed.");
        } else response.end();
      }));
      const sockets = new Set<Socket>();
      http.on("connection", (socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
      });
      const origin = await listen(http);
      created = { http, sockets, origin, token, tools: nextTools, connections: new Map() };
      host = created;
      this.#hosts.set(engineSessionKey, host);
    } else {
      host.tools = nextTools;
      await Promise.allSettled([...host.connections.values()].map(({ server }) => server.sendToolListChanged()));
    }
    return { url: `${host.origin}/mcp`, token: host.token, hasTools: host.tools.size > 0 };
  }

  async clear(engineSessionKey: string): Promise<void> {
    const host = this.#hosts.get(engineSessionKey);
    if (!host || host.tools.size === 0) return;
    host.tools = new Map();
    await Promise.allSettled([...host.connections.values()].map(({ server }) => server.sendToolListChanged()));
  }

  async stop(engineSessionKey: string): Promise<void> {
    const host = this.#hosts.get(engineSessionKey);
    if (!host) return;
    this.#hosts.delete(engineSessionKey);
    await Promise.allSettled([...host.connections.values()].map(async ({ server, transport }) => {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }));
    host.connections.clear();
    await new Promise<void>((resolve) => {
      host.http.close(() => resolve());
      for (const socket of host.sockets) socket.destroy();
      host.http.closeAllConnections?.();
    });
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled([...this.#hosts.keys()].map((key) => this.stop(key)));
  }

  async #handle(host: ManagedNativeToolMcpHost, request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.authorization !== `Bearer ${host.token}`) {
      jsonRpcError(response, 401, "Unauthorized");
      return;
    }
    const url = new URL(request.url ?? "/", host.origin);
    if (url.pathname !== "/mcp") {
      jsonRpcError(response, 404, "Not found");
      return;
    }
    const sessionHeader = request.headers["mcp-session-id"];
    const sessionId = typeof sessionHeader === "string" ? sessionHeader : undefined;
    let connection = sessionId ? host.connections.get(sessionId) : undefined;
    let body: unknown;
    if (request.method === "POST") body = await requestBody(request);
    if (!connection && request.method === "POST" && !sessionId && isInitializeRequest(body)) {
      const server = createMcpServer(host);
      let transport!: StreamableHTTPServerTransport;
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => { host.connections.set(id, { server, transport }); },
      });
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id) host.connections.delete(id);
      };
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
      return;
    }
    if (!connection) {
      jsonRpcError(response, 400, "Invalid or missing MCP session ID.");
      return;
    }
    if (request.method !== "POST" && request.method !== "GET" && request.method !== "DELETE") {
      jsonRpcError(response, 405, "Method not allowed");
      return;
    }
    await connection.transport.handleRequest(request, response, body);
  }
}
