import { Hono } from "hono";
import type { Server as HttpServer } from "node:http";
import type { Http2SecureServer, Http2Server } from "node:http2";
import { connectSessionStream } from "../agent/session-stream";
import { createNodeWebSocket } from "./hono-node-ws";

const CLIENT_TIMEOUT_MS = 60000;
const CLIENT_HANDSHAKE_TIMEOUT_MS = 10000;
const CLOSE_CODE_BAD_REQUEST = 1008;

type ClientMessage =
  | { type: "session.connect"; sessionId?: string; lastEventId?: string | null }
  | { type: "ping" };

const agentWsApp = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: agentWsApp });

export const agentWsRoute = agentWsApp.get(
  "/api/agent/ws",
  upgradeWebSocket(() => {
    let unsubscribeSession: (() => void) | null = null;
    let clientTimeout: NodeJS.Timeout | null = null;
    let handshakeTimeout: NodeJS.Timeout | null = null;
    let lastClientActivity = Date.now();

    const cleanup = () => {
      if (unsubscribeSession) {
        unsubscribeSession();
        unsubscribeSession = null;
      }

      if (clientTimeout) {
        clearInterval(clientTimeout);
        clientTimeout = null;
      }

      if (handshakeTimeout) {
        clearTimeout(handshakeTimeout);
        handshakeTimeout = null;
      }
    };

    return {
      onOpen(_event, ws) {
        lastClientActivity = Date.now();

        handshakeTimeout = setTimeout(() => {
          ws.close(CLOSE_CODE_BAD_REQUEST, "session.connect required");
          cleanup();
        }, CLIENT_HANDSHAKE_TIMEOUT_MS);

        clientTimeout = setInterval(() => {
          if (Date.now() - lastClientActivity <= CLIENT_TIMEOUT_MS) {
            return;
          }

          ws.close(CLOSE_CODE_BAD_REQUEST, "Client heartbeat timeout");
          cleanup();
        }, CLIENT_TIMEOUT_MS / 2);
      },

      async onMessage(event, ws) {
        lastClientActivity = Date.now();

        let message: ClientMessage;
        try {
          message = JSON.parse(String(event.data)) as ClientMessage;
        } catch {
          ws.close(CLOSE_CODE_BAD_REQUEST, "Invalid message");
          cleanup();
          return;
        }

        if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if (message.type !== "session.connect" || !message.sessionId?.trim()) {
          ws.close(CLOSE_CODE_BAD_REQUEST, "sessionId is required");
          cleanup();
          return;
        }

        if (handshakeTimeout) {
          clearTimeout(handshakeTimeout);
          handshakeTimeout = null;
        }

        unsubscribeSession?.();
        unsubscribeSession = await connectSessionStream({
          sessionId: message.sessionId,
          lastEventId: message.lastEventId,
          send: (payload) => {
            ws.send(JSON.stringify(payload));
          },
        });
      },

      onClose() {
        cleanup();
      },

      onError() {
        cleanup();
      },
    };
  }),
);

export type AgentWsAppType = typeof agentWsRoute;

export function injectAgentWebSocket(server: HttpServer | Http2Server | Http2SecureServer): void {
  injectWebSocket(server);
}
