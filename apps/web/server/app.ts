import "react-router";
import { createRequestHandler } from "@react-router/express";
import express from "express";
import { agentRpcRequestListener } from "../app/lib/agent-rpc-hono";
export { injectAgentWebSocket } from "../app/lib/agent-ws";

declare module "react-router" {
  interface AppLoadContext {
    VALUE_FROM_EXPRESS: string;
  }
}

export const app = express();

app.use("/api/rpc", (req, res) => {
  void agentRpcRequestListener(req, res);
});

app.use(
  createRequestHandler({
    build: () => import("virtual:react-router/server-build"),
    getLoadContext() {
      return {
        VALUE_FROM_EXPRESS: "Hello from Express",
      };
    },
  }),
);
