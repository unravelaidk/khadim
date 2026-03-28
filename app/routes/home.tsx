import type { Route } from "./+types/home";
import { AgentBuilder } from "../components/AgentBuilder";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Khadim - AI Agent Builder" },
    { name: "description", content: "Build your own AI agents with Khadim" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { message: context.VALUE_FROM_EXPRESS };
}

export default function Home() {
  return <AgentBuilder initialView="chat" />;
}
