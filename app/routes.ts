import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("workspace", "routes/workspace.tsx"),
  route("workspace/:workspaceId", "routes/workspace.$workspaceId.tsx"),
  route("agent/:chatId", "routes/agent.$chatId.tsx"),
  route("api/workspaces", "routes/api.workspaces.ts"),
  route("api/workspaces/:id", "routes/api.workspaces.$id.ts"),
  route("api/workspace-files", "routes/api.workspace-files.ts"),
  route("api/workspace-files/:id", "routes/api.workspace-files.$id.ts"),
  route("api/sandbox/kill", "routes/api.sandbox.kill.ts"),
  route("api/sandbox/connect", "routes/api.sandbox.connect.ts"),
  route("api/chats", "routes/api.chats.ts"),
  route("api/chats/:id", "routes/api.chats.$id.ts"),
  route("api/messages", "routes/api.messages.ts"),
  route("api/models", "routes/api.models.ts"),
] satisfies RouteConfig;
