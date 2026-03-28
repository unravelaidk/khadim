import type { Route } from "./+types/workspace";
import { AgentBuilder } from "../components/AgentBuilder";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Khadim - Workspace" },
    { name: "description", content: "Start and organize workspaces inside Khadim" },
  ];
}

export default function WorkspaceHome() {
  return <AgentBuilder initialView="workspace" />;
}
