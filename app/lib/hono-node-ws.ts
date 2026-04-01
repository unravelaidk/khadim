import { STATUS_CODES, type IncomingMessage, type Server } from "node:http";
import type { Http2SecureServer, Http2Server } from "node:http2";
import { Hono } from "hono";
import { defineWebSocketHelper, type UpgradeWebSocket } from "hono/ws";
import { WebSocketServer, type RawData, type WebSocket as NodeSocket } from "ws";

const connectionSymbolKey = Symbol("CONNECTION_SYMBOL_KEY");

type Waiter = {
  resolve: (socket: NodeSocket) => void;
  connectionSymbol: symbol;
};

class NodeCloseEvent extends Event {
  readonly code: number;
  readonly reason: string;

  constructor(type: string, init: { code: number; reason: string }) {
    super(type);
    this.code = init.code;
    this.reason = init.reason;
  }
}

export interface NodeWebSocket {
  upgradeWebSocket: UpgradeWebSocket<NodeSocket, { onError: (err: unknown) => void }>;
  injectWebSocket: (server: Server | Http2Server | Http2SecureServer) => void;
  wss: WebSocketServer;
}

export function createNodeWebSocket(init: { app: Hono; baseUrl?: string | URL }): NodeWebSocket {
  const wss = new WebSocketServer({ noServer: true });
  const waiterMap = new Map<unknown, Waiter>();

  wss.on("connection", (socket: NodeSocket, request: IncomingMessage) => {
    const waiter = waiterMap.get(request);
    if (!waiter) {
      return;
    }

    waiter.resolve(socket);
    waiterMap.delete(request);
  });

  const waitForUpgrade = (request: unknown, connectionSymbol: symbol) => {
    return new Promise<NodeSocket>((resolve) => {
      waiterMap.set(request, { resolve, connectionSymbol });
    });
  };

  return {
    wss,
    injectWebSocket(server) {
      server.on("upgrade", async (request, socket, head) => {
        const url = new URL(request.url ?? "/", init.baseUrl ?? "http://localhost");
        const headers = new Headers();

        for (const key in request.headers) {
          const value = request.headers[key];
          if (!value) continue;
          headers.append(key, Array.isArray(value) ? value[0] : value);
        }

        const env = {
          incoming: request,
          outgoing: undefined,
        } as Record<string | symbol, unknown>;

        const response = await init.app.request(url, { headers }, env);
        const waiter = waiterMap.get(request);
        if (!waiter || waiter.connectionSymbol !== env[connectionSymbolKey]) {
          socket.end(
            `HTTP/1.1 ${response.status.toString()} ${STATUS_CODES[response.status] ?? ""}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
          );
          waiterMap.delete(request);
          return;
        }

        wss.handleUpgrade(request, socket, head, (upgradedSocket: NodeSocket) => {
          wss.emit("connection", upgradedSocket, request);
        });
      });
    },
    upgradeWebSocket: defineWebSocketHelper(async (c, events, options) => {
      if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
        return;
      }

      const connectionSymbol = Symbol("connection");
      (c.env as Record<string | symbol, unknown>)[connectionSymbolKey] = connectionSymbol;

      void (async () => {
        const socket = await waitForUpgrade((c.env as Record<string, unknown>).incoming, connectionSymbol);
        const bufferedMessages: Array<[RawData, boolean]> = [];
        const bufferMessage = (data: RawData, isBinary: boolean) => {
          bufferedMessages.push([data, isBinary]);
        };

        socket.on("message", bufferMessage);

        const context = {
          binaryType: "arraybuffer" as const,
          close(code?: number, reason?: string) {
            socket.close(code, reason);
          },
          protocol: socket.protocol,
          raw: socket,
          get readyState() {
            return socket.readyState as 0 | 1 | 2 | 3;
          },
          send(source: string | ArrayBuffer | Uint8Array, sendOptions?: { compress?: boolean }) {
            socket.send(source, { compress: sendOptions?.compress });
          },
          url: new URL(c.req.url),
        };

        try {
          events?.onOpen?.(new Event("open"), context);
        } catch (error) {
          (options?.onError ?? console.error)(error);
        }

        const handleMessage = (data: RawData, isBinary: boolean) => {
          const chunks = Array.isArray(data) ? data : [data];
          for (const chunk of chunks) {
            try {
              events?.onMessage?.(
                new MessageEvent("message", {
                  data: isBinary
                    ? chunk instanceof ArrayBuffer
                      ? chunk
                      : chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)
                    : chunk.toString("utf-8"),
                }),
                context,
              );
            } catch (error) {
              (options?.onError ?? console.error)(error);
            }
          }
        };

        socket.off("message", bufferMessage);
        for (const message of bufferedMessages) {
          handleMessage(...message);
        }

        socket.on("message", (data: RawData, isBinary: boolean) => {
          handleMessage(data, isBinary);
        });
        socket.on("close", (code: number, reason: Buffer) => {
          try {
            events?.onClose?.(
              new NodeCloseEvent("close", {
                code,
                reason: reason.toString(),
              }) as any,
              context,
            );
          } catch (error) {
            (options?.onError ?? console.error)(error);
          }
        });
        socket.on("error", (error: Error) => {
          try {
            const errorEvent = new Event("error");
            Object.assign(errorEvent, { error });
            events?.onError?.(errorEvent, context);
          } catch (nestedError) {
            (options?.onError ?? console.error)(nestedError);
          }
        });
      })();

      return new Response();
    }),
  };
}
