import type { Route } from "./+types/home";
import { AgentBuilder } from "../components/AgentBuilder";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dexo - AI Agent Builder" },
    { name: "description", content: "Build your own AI agents with Dexo" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { message: context.VALUE_FROM_EXPRESS };
}

export default function Home() {
  return <AgentBuilder />;
}

