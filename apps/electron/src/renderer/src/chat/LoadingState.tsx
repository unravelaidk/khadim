"use client";

import { useEffect, useState } from "react";
import type { OrbState } from "thinking-orbs";
import { AgentThinkingOrb } from "./AgentThinkingOrb";

function useElapsed(): string {
  const [deciseconds, setDeciseconds] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setDeciseconds((elapsed) => elapsed + 1), 100);
    return () => window.clearInterval(timer);
  }, []);

  const total = deciseconds / 10;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

export default function LoadingState({
  label = "Preparing response",
  state = "working",
}: {
  label?: string;
  state?: OrbState;
}): React.JSX.Element {
  const elapsed = useElapsed();

  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-state-orb" aria-hidden="true"><AgentThinkingOrb state={state} decorative /></span>
      <span className="loading-state-label">{label}</span>
      <span className="loading-state-elapsed" aria-hidden="true">{elapsed}</span>
      <span className="sr-only">Agent work is in progress.</span>
    </div>
  );
}
