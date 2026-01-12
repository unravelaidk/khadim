import type { Route } from "./+types/agent.$chatId";
import { AgentBuilder } from "../components/AgentBuilder";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Khadim - AI Agent Builder" },
    { name: "description", content: "Build your own AI agents with Khadim" },
  ];
}

export function loader({ params }: Route.LoaderArgs) {
  return { chatId: params.chatId };
}

export default function AgentChat({ loaderData }: Route.ComponentProps) {
  return <AgentBuilder initialChatId={loaderData.chatId} />;
}
