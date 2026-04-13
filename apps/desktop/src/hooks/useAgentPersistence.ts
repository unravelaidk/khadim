import { useEffect, useRef } from "react";
import { commands } from "../lib/bindings";
import type { AgentInstance } from "../lib/types";

const AGENT_STATE_KEY = "khadim:agent_state";

type PersistedAgentState = {
  id: string;
  workspaceId: string;
  status: AgentInstance["status"];
  currentActivity: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  modelLabel: string | null;
  issueUrl: string | null;
};

function toPersistedState(agent: AgentInstance): PersistedAgentState {
  return {
    id: agent.id,
    workspaceId: agent.workspaceId,
    status: agent.status,
    currentActivity: agent.currentActivity,
    startedAt: agent.startedAt,
    finishedAt: agent.finishedAt,
    errorMessage: agent.errorMessage,
    modelLabel: agent.modelLabel,
    issueUrl: agent.issueUrl,
  };
}

function mergePersistedState(
  agents: AgentInstance[],
  persisted: PersistedAgentState[],
): AgentInstance[] {
  const persistedMap = new Map(persisted.map((p) => [p.id, p]));  return agents.map((agent) => {
    const saved = persistedMap.get(agent.id);
    if (!saved) return agent;
    // If a previous session was "running" when the app closed, it's no longer
    // streaming after restart. Reset to "idle" so the UI doesn't get stuck
    // showing a permanent typing indicator.
    const restoredStatus = saved.status === "running" ? "idle" as const : saved.status;
    const restoredActivity = saved.status === "running" ? null : saved.currentActivity;
    return {
      ...agent,
      status: restoredStatus,
      currentActivity: restoredActivity,
      startedAt: saved.startedAt,
      finishedAt: saved.finishedAt,
      errorMessage: saved.errorMessage,
      modelLabel: saved.modelLabel ?? agent.modelLabel,
      issueUrl: saved.issueUrl ?? agent.issueUrl,
    };
  });
}

export function useAgentPersistence(
  agents: AgentInstance[],
  setAgents: (agents: AgentInstance[]) => void,
) {
  const hasLoadedRef = useRef(false);

  const loadPersistedState = async (): Promise<PersistedAgentState[]> => {
    try {
      const raw = await commands.getSetting(AGENT_STATE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as PersistedAgentState[];
    } catch {
      return [];
    }
  };

  const savePersistedState = async (agents: AgentInstance[]) => {
    try {
      const state = agents
        .filter((a) => a.status !== "idle" || a.modelLabel)
        .map(toPersistedState);
      await commands.setSetting(AGENT_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Failed to save agent state:", error);
    }
  };

  useEffect(() => {
    if (agents.length === 0 || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    loadPersistedState()
      .then((persisted) => {
        if (persisted.length > 0) {
          setAgents(mergePersistedState(agents, persisted));
        }
      })
      .catch((error) => {
        console.warn("Failed to load agent state:", error);
      });
  }, [agents.length]);

  useEffect(() => {
    if (agents.length === 0) return;

    const timeoutId = setTimeout(() => {
      savePersistedState(agents);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [
    agents.map((a) => `${a.id}:${a.status}:${a.currentActivity}:${a.startedAt}:${a.finishedAt}`).join("|"),
  ]);
}