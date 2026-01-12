import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("agent/:chatId", "routes/agent.$chatId.tsx"),
  route("api/agent", "routes/api.agent.ts"),
  route("api/agent/stop", "routes/api.agent.stop.ts"),
  route("api/sandbox/kill", "routes/api.sandbox.kill.ts"),
  route("api/sandbox/connect", "routes/api.sandbox.connect.ts"),
  route("api/chats", "routes/api.chats.ts"),
  route("api/chats/:id", "routes/api.chats.$id.ts"),
  route("api/messages", "routes/api.messages.ts"),
] satisfies RouteConfig;
