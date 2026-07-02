import { Hono } from "hono";
import type { Server as HttpServer } from "node:http";
import type { Http2SecureServer, Http2Server } from "node:http2";
import { resolveLiveHost, runLiveHostInput } from "../agent/live-session-commands";
import { connectSessionStream } from "../agent/session-stream";
import { createNodeWebSocket } from "./hono-node-ws";

const CLIENT_TIMEOUT_MS = 60000;
const CLIENT_HANDSHAKE_TIMEOUT_MS = 10000;
const CLOSE_CODE_BAD_REQUEST = 1008;

type ClientMessage =
  | { type: "session.connect"; sessionId?: string; lastEventId?: string | null }
  | { type: "ping" }
  | { type: "job.followUp"; prompt?: string; chatId?: string; jobId?: string; requestId?: string }
  | { type: "job.steer"; prompt?: string; chatId?: string; jobId?: string; requestId?: string };

const agentWsApp = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: agentWsApp });

export const agentWsRoute = agentWsApp.get(
  "/api/agent/ws",
  upgradeWebSocket(() => {
    let unsubscribeSession: (() => void) | null = null;
    let clientTimeout: NodeJS.Timeout | null = null;
    let handshakeTimeout: NodeJS.Timeout | null = null;
    let lastClientActivity = Date.now();
    let connectedSessionId: string | null = null;

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

        if (message.type === "job.followUp" || message.type === "job.steer") {
          // Command replies carry the client's requestId and a dedicated
          // command_error type so concurrent commands (one per chat) can be
          // correlated, and job "error" stream events are never mistaken for
          // command failures.
          const requestId = typeof message.requestId === "string" ? message.requestId : undefined;
          const sendCommandError = (error: string) => {
            ws.send(JSON.stringify({ type: "command_error", requestId, command: message.type, error }));
          };

          if (!connectedSessionId) {
            sendCommandError("session.connect required before commands");
            return;
          }

          const prompt = typeof message.prompt === "string" && message.prompt.trim().length > 0 ? message.prompt : null;
          if (!prompt) {
            sendCommandError("prompt is required");
            return;
          }

          const record = resolveLiveHost({
            sessionId: connectedSessionId,
            chatId: typeof message.chatId === "string" ? message.chatId : undefined,
            jobId: typeof message.jobId === "string" ? message.jobId : undefined,
          });
          if (!record) {
            sendCommandError("No live session host found");
            return;
          }

          try {
            const result = await runLiveHostInput({ method: message.type, prompt, record });
            ws.send(JSON.stringify({ type: "command_accepted", requestId, command: message.type, ...result }));
          } catch (error) {
            sendCommandError(error instanceof Error ? error.message : "Session command failed");
          }
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
        connectedSessionId = message.sessionId;
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
