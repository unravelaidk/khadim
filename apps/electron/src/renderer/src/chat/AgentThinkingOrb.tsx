import { ThinkingOrb, type OrbState } from "thinking-orbs";
import type { ToolCallActivity } from "../../../shared/types";

const searchTools = new Set(["web_search", "web_fetch", "webfetch"]);
const shapingTools = new Set(["edit", "write", "artifact_edit"]);
const connectingTools = new Set(["apps", "http", "browser", "gmail", "drive", "calendar"]);

export function orbStateForActivities(activities: ToolCallActivity[]): OrbState {
  const activity = activities.find((candidate) => candidate.status === "running") ?? activities.at(-1);
  if (!activity) return "working";
  if (searchTools.has(activity.tool)) return "searching";
  if (shapingTools.has(activity.tool)) return "shaping";
  if (connectingTools.has(activity.tool)) return "connecting";
  if (activity.tool === "bash" || activity.tool === "shell") return "solving";
  return "working";
}

export function AgentThinkingOrb({
  activities = [],
  state,
  decorative = false,
}: {
  activities?: ToolCallActivity[];
  state?: OrbState;
  decorative?: boolean;
}): React.JSX.Element {
  const resolvedState = state ?? orbStateForActivities(activities);
  return (
    <ThinkingOrb
      className="agent-thinking-orb"
      state={resolvedState}
      size={20}
      theme="auto"
      data-orb-state={resolvedState}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Khadim is ${resolvedState}`}
    />
  );
}
