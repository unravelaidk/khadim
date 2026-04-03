import type { Route } from "./+types/workspace.$workspaceId";
import { AgentBuilder } from "../components/AgentBuilder";

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: `Khadim - Workspace ${params.workspaceId}` },
    { name: "description", content: "Workspace details and related chats in Khadim" },
  ];
}

export function loader({ params }: Route.LoaderArgs) {
  return { workspaceId: params.workspaceId };
}

export default function WorkspaceDetail({ loaderData }: Route.ComponentProps) {
  return <AgentBuilder initialView="workspace" initialWorkspaceId={loaderData.workspaceId} />;
}
