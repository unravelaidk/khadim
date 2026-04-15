import React, { useState, useCallback, useEffect } from "react";
import type {
  WorkView,
  ManagedAgent,
  SessionRecord,
  Environment,
  Credential,
  MemoryStore,
  MemoryEntry,
} from "../lib/types";
import {
  WorkDashboard,
  AgentList,
  AgentEditor,
  SessionList,
  SessionDetail,
  EnvironmentList,
  EnvironmentEditor,
  CredentialList,
  CredentialEditor,
  MemoryStoreList,
  MemoryStoreDetail,
  MemoryStoreEditor,
  MemoryEntryEditor,
  AnalyticsDashboard,
  IntegrationsList,
  Quickstart,
} from "./work";
import type {
  AgentEditorData,
  EnvironmentEditorData,
  CredentialEditorData,
  MemoryStoreEditorData,
  MemoryEntryEditorData,
} from "./work";
import { useQueryClient } from "@tanstack/react-query";
import {
  useManagedAgentsQuery,
  useCreateManagedAgentMutation,
  useUpdateManagedAgentMutation,
  useDeleteManagedAgentMutation,
  useEnvironmentsQuery,
  useCreateEnvironmentMutation,
  useUpdateEnvironmentMutation,
  useDeleteEnvironmentMutation,
  useCredentialsQuery,
  useCreateCredentialMutation,
  useUpdateCredentialMutation,
  useDeleteCredentialMutation,
  useMemoryStoresQuery,
  useCreateMemoryStoreMutation,
  useUpdateMemoryStoreMutation,
  useDeleteMemoryStoreMutation,
  useMemoryEntriesQuery,
  useCreateMemoryEntryMutation,
  useDeleteMemoryEntryMutation,
  useAgentRunsQuery,
  useAgentRunTurnsQuery,
  useRunManagedAgentMutation,
  useStopAgentRunMutation,
  useAgentEditorModelsQuery,
  desktopQueryKeys,
} from "../lib/queries";
import { events, commands } from "../lib/bindings";
import type { AgentStreamEvent, ThinkingStepData, UpsertManagedAgentInput, UpsertEnvironmentInput, UpsertCredentialInput } from "../lib/bindings";
import { applyStreamingStepEvent, finalizeSteps, formatStreamingError } from "../lib/streaming";

/* ═══════════════════════════════════════════════════════════════════════
   Work Area — wired to Tauri backend via React Query
   ═══════════════════════════════════════════════════════════════════════ */

interface WorkAreaProps {
  view: WorkView;
  onNavigate: (view: WorkView) => void;
}

export function WorkArea({ view, onNavigate }: WorkAreaProps) {
  // ── Data queries ──────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const agentsQ = useManagedAgentsQuery();
  const sessionsQ = useAgentRunsQuery();
  const environmentsQ = useEnvironmentsQuery();
  const credentialsQ = useCredentialsQuery();
  const memoryStoresQ = useMemoryStoresQuery();
  const modelsQ = useAgentEditorModelsQuery();

  const agents: ManagedAgent[] = agentsQ.data ?? [];
  const sessions: SessionRecord[] = sessionsQ.data ?? [];
  const environments: Environment[] = environmentsQ.data ?? [];
  const credentials: Credential[] = credentialsQ.data ?? [];
  const memoryStores: MemoryStore[] = memoryStoresQ.data ?? [];

  // ── Mutations ─────────────────────────────────────────────────────
  const createAgent = useCreateManagedAgentMutation();
  const updateAgent = useUpdateManagedAgentMutation();
  const deleteAgent = useDeleteManagedAgentMutation();

  const createEnv = useCreateEnvironmentMutation();
  const updateEnv = useUpdateEnvironmentMutation();
  const deleteEnv = useDeleteEnvironmentMutation();

  const createCred = useCreateCredentialMutation();
  const updateCred = useUpdateCredentialMutation();
  const deleteCred = useDeleteCredentialMutation();

  const runAgent = useRunManagedAgentMutation();
  const stopRun = useStopAgentRunMutation();

  const createMemStore = useCreateMemoryStoreMutation();
  const updateMemStore = useUpdateMemoryStoreMutation();
  const deleteMemStore = useDeleteMemoryStoreMutation();

  const createMemEntry = useCreateMemoryEntryMutation();
  const deleteMemEntry = useDeleteMemoryEntryMutation();
  const envSaveError = createEnv.error ?? updateEnv.error;

  // ── Local navigation state ────────────────────────────────────────
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedMemoryStoreId, setSelectedMemoryStoreId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"closed" | "quickstart" | "editor">("closed");
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [templateData, setTemplateData] = useState<AgentEditorData | null>(null);
  const [envEditorOpen, setEnvEditorOpen] = useState(false);
  const [envEditorTarget, setEnvEditorTarget] = useState<string | null>(null);
  const [credEditorOpen, setCredEditorOpen] = useState(false);
  const [credEditorTarget, setCredEditorTarget] = useState<string | null>(null);
  const [memStoreEditorOpen, setMemStoreEditorOpen] = useState(false);
  const [memEntryEditorOpen, setMemEntryEditorOpen] = useState(false);

  // Clear detail selections when switching tabs
  const prevView = React.useRef(view);
  if (prevView.current !== view) {
    prevView.current = view;
    if (selectedSessionId) setSelectedSessionId(null);
    if (selectedMemoryStoreId) setSelectedMemoryStoreId(null);
    if (editorMode !== "closed") { setEditorMode("closed"); setEditingAgentId(null); }
    if (envEditorOpen) { setEnvEditorOpen(false); setEnvEditorTarget(null); }
    if (credEditorOpen) { setCredEditorOpen(false); setCredEditorTarget(null); }
    if (memStoreEditorOpen) setMemStoreEditorOpen(false);
    if (memEntryEditorOpen) setMemEntryEditorOpen(false);
  }

  // ── Model list for agent editor ───────────────────────────────────
  const availableModels = (modelsQ.data ?? []).map((m) => ({
    id: `${m.provider_id}:${m.model_id}`,
    label: m.model_name,
  }));

  // ── Agent editor save ─────────────────────────────────────────────
  const handleAgentSave = useCallback(
    async (data: AgentEditorData) => {
      const input: UpsertManagedAgentInput = {
        name: data.name,
        description: data.description,
        instructions: data.instructions,
        tools: data.tools,
        trigger_type: data.triggerType,
        trigger_config: data.triggerConfig || null,
        approval_mode: data.approvalMode,
        runner_type: data.runnerType,
        harness: data.harness,
        model_id: data.modelId || null,
        environment_id: data.environmentId || null,
        max_turns: data.maxTurns,
        max_tokens: data.maxTokens,
        variables: data.variables ?? {},
      };

      let agentId = editingAgentId;
      if (editingAgentId) {
        await updateAgent.mutateAsync({ id: editingAgentId, input });
      } else {
        const created = await createAgent.mutateAsync(input);
        agentId = created.id;
      }

      // Handle memory store linking
      if (agentId && data.memoryStoreId) {
        if (data.memoryStoreId === "auto") {
          // Ensure a memory store exists for this agent
          try {
            await commands.ensureAgentMemoryStore(agentId, data.name);
          } catch (e) {
            console.warn("Failed to ensure agent memory store:", e);
          }
        } else {
          // Link the selected existing store to this agent
          try {
            const store = (memoryStoresQ.data ?? []).find((s) => s.id === data.memoryStoreId);
            if (store) {
              const linkedIds = store.linkedAgentIds.includes(agentId)
                ? store.linkedAgentIds
                : [...store.linkedAgentIds, agentId];
              const primaryIds = store.primaryForAgentIds.includes(agentId)
                ? store.primaryForAgentIds
                : [...store.primaryForAgentIds, agentId];
              await commands.updateMemoryStore(store.id, {
                name: store.name,
                description: store.description,
                scope_type: store.scopeType as "chat" | "agent" | "shared",
                linked_agent_ids: linkedIds,
                primary_for_agent_ids: primaryIds,
              });
            }
          } catch (e) {
            console.warn("Failed to link memory store:", e);
          }
        }
        void queryClient.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores }).catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: desktopQueryKeys.agentMemoryStores(agentId) }).catch(() => undefined);
      }

      setEditorMode("closed");
      setEditingAgentId(null);
    },
    [editingAgentId, createAgent, updateAgent, memoryStoresQ.data, queryClient],
  );

  // ── Environment editor save ───────────────────────────────────────
  const handleEnvSave = useCallback(
    async (data: EnvironmentEditorData) => {
      const input: UpsertEnvironmentInput = {
        name: data.name,
        description: data.description,
        runner_type: data.runnerType,
        docker_image: data.runnerType === "docker" ? data.dockerImage || null : null,
        variables: data.variables,
        credential_ids: data.credentialIds,
        is_default: data.isDefault,
      };
      if (envEditorTarget) {
        await updateEnv.mutateAsync({ id: envEditorTarget, input });
      } else {
        await createEnv.mutateAsync(input);
      }
      setEnvEditorOpen(false);
      setEnvEditorTarget(null);
    },
    [envEditorTarget, createEnv, updateEnv],
  );

  // ── Credential editor save ────────────────────────────────────────
  const handleCredSave = useCallback(
    async (data: CredentialEditorData) => {
      const input: UpsertCredentialInput = {
        name: data.name,
        credential_type: data.type,
        service: data.service || null,
        metadata: data.fields,
        secret_value: data.secretValue || null,
      };
      if (credEditorTarget) {
        await updateCred.mutateAsync({ id: credEditorTarget, input });
      } else {
        await createCred.mutateAsync(input);
      }
      setCredEditorOpen(false);
      setCredEditorTarget(null);
    },
    [credEditorTarget, createCred, updateCred],
  );

  // ── Memory store editor save ──────────────────────────────────────
  const handleMemStoreSave = useCallback(
    async (data: MemoryStoreEditorData) => {
      if (selectedMemoryStoreId) {
        await updateMemStore.mutateAsync({
          id: selectedMemoryStoreId,
          input: {
            name: data.name,
            description: data.description,
          },
        });
      } else {
        await createMemStore.mutateAsync({
          name: data.name,
          description: data.description,
          scope_type: "shared",
        });
      }
      setMemStoreEditorOpen(false);
    },
    [selectedMemoryStoreId, createMemStore, updateMemStore],
  );

  // ── Needs-attention: sessions that are pending/running and might need input
  const needsAttention = sessions.filter(
    (s) => s.status === "running" || s.status === "pending",
  );

  // ── Compute analytics
  const totalTokens = sessions.reduce(
    (sum, s) => sum + (s.tokenUsage ? s.tokenUsage.inputTokens + s.tokenUsage.outputTokens : 0),
    0,
  );
  // Very rough estimate: $3/M input, $15/M output (blended)
  const estimatedCost = sessions.reduce((sum, s) => {
    if (!s.tokenUsage) return sum;
    return sum + (s.tokenUsage.inputTokens * 3 + s.tokenUsage.outputTokens * 15) / 1_000_000;
  }, 0);

  // Daily sessions for chart (last 14 days)
  const dailySessions = React.useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      const count = sessions.filter((s) => {
        if (!s.startedAt) return false;
        const t = new Date(s.startedAt).getTime();
        return t >= dayStart && t < dayEnd;
      }).length;
      days.push({ date: dateStr, count });
    }
    return days;
  }, [sessions]);

  // Agent breakdown for analytics
  const agentBreakdown = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const name = s.agentName ?? "Chat";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, sessions: count }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [sessions]);

  // ── Agent editor / quickstart ─────────────────────────────────────
  if (editorMode === "quickstart") {
    return (
      <Quickstart
        onSelectTemplate={(data) => {
          setTemplateData(data);
          setEditorMode("editor");
        }}
        onSkip={() => {
          setEditingAgentId(null);
          setTemplateData(null);
          setEditorMode("editor");
        }}
      />
    );
  }

  if (editorMode === "editor") {
    const editingAgent = editingAgentId
      ? agents.find((a) => a.id === editingAgentId) ?? null
      : null;
    // If coming from a template, build a temporary ManagedAgent-shaped object
      const agentForEditor = editingAgent ?? (templateData ? {
        id: "",
        name: templateData.name,
        description: templateData.description,
      instructions: templateData.instructions,
      tools: templateData.tools,
      triggerType: templateData.triggerType,
      triggerConfig: templateData.triggerConfig,
      approvalMode: templateData.approvalMode,
      runnerType: templateData.runnerType,
        harness: templateData.harness,
        status: "inactive" as const,
        modelId: templateData.modelId || null,
        environmentId: null,
        maxTurns: templateData.maxTurns,
        maxTokens: templateData.maxTokens,
        variables: templateData.variables ?? {},
      version: 0,
      stats: { totalSessions: 0, successRate: 0, lastRunAt: null },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ManagedAgent : null);
    return (
      <AgentEditor
        agent={agentForEditor}
        availableModels={availableModels}
        availableEnvironments={environments}
        onSave={handleAgentSave}
        onCancel={() => { setEditorMode("closed"); setEditingAgentId(null); setTemplateData(null); }}
        onTest={(data) => console.log("[WorkArea] Test agent:", data)}
      />
    );
  }

  // ── Session detail view ───────────────────────────────────────────
  if (selectedSessionId) {
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (session) {
      return (
        <SessionDetailWired
          session={session}
          onBack={() => setSelectedSessionId(null)}
        />
      );
    }
  }

  // ── Memory store detail view ──────────────────────────────────────
  if (selectedMemoryStoreId) {
    const store = memoryStores.find((s) => s.id === selectedMemoryStoreId);
    if (store) {
      return (
        <MemoryStoreDetailWired
          store={store}
          onBack={() => setSelectedMemoryStoreId(null)}
          onAddEntry={() => setMemEntryEditorOpen(true)}
          showEntryEditor={memEntryEditorOpen}
          onCloseEntryEditor={() => setMemEntryEditorOpen(false)}
        />
      );
    }
  }

  // ── Environment editor ────────────────────────────────────────────
  if (envEditorOpen) {
    const target = envEditorTarget
      ? environments.find((e) => e.id === envEditorTarget) ?? null
      : null;
    return (
      <EnvironmentEditor
        environment={target}
        availableCredentials={credentials}
        onSave={handleEnvSave}
        onCancel={() => { setEnvEditorOpen(false); setEnvEditorTarget(null); }}
        onDelete={target ? async () => {
          await deleteEnv.mutateAsync(target.id);
          setEnvEditorOpen(false);
          setEnvEditorTarget(null);
        } : undefined}
      />
    );
  }

  // ── Credential editor ─────────────────────────────────────────────
  if (credEditorOpen) {
    const target = credEditorTarget
      ? credentials.find((c) => c.id === credEditorTarget) ?? null
      : null;
    return (
      <CredentialEditor
        credential={target}
        onSave={handleCredSave}
        onCancel={() => { setCredEditorOpen(false); setCredEditorTarget(null); }}
        onDelete={target ? async () => {
          await deleteCred.mutateAsync(target.id);
          setCredEditorOpen(false);
          setCredEditorTarget(null);
        } : undefined}
      />
    );
  }

  // ── Memory store editor ───────────────────────────────────────────
  if (memStoreEditorOpen && !selectedMemoryStoreId) {
    return (
      <MemoryStoreEditor
        store={null}
        onSave={handleMemStoreSave}
        onCancel={() => setMemStoreEditorOpen(false)}
      />
    );
  }

  // ── Main views ────────────────────────────────────────────────────
  switch (view) {
    case "dashboard":
      return (
        <WorkDashboard
          agents={agents}
          sessions={sessions}
          needsAttention={needsAttention}
          onViewSession={setSelectedSessionId}
          onNavigateAgents={() => onNavigate("agents")}
          onNavigateSessions={() => onNavigate("sessions")}
          onCreateAgent={() => { setEditingAgentId(null); setEditorMode("quickstart"); }}
          onRunAgent={(id) => {
            runAgent.mutate({ agentId: id }, {
              onSuccess: (run) => {
                onNavigate("sessions");
                setSelectedSessionId(run.id);
              },
            });
          }}
          totalTokens={totalTokens}
          estimatedCost={estimatedCost}
          dailySessions={dailySessions}
        />
      );
    case "agents":
      return (
        <AgentList
          agents={agents}
          onCreateAgent={() => { setEditingAgentId(null); setEditorMode("quickstart"); }}
          onConfigureAgent={(id) => { setEditingAgentId(id); setEditorMode("editor"); }}
          onToggleAgent={(id) => {
            const agent = agents.find((a) => a.id === id);
            if (!agent) return;
            const nextStatus = agent.status === "active" ? "inactive" : "active";
            updateAgent.mutate({
              id,
              input: {
                name: agent.name,
                description: agent.description,
                instructions: agent.instructions,
                tools: agent.tools,
                trigger_type: agent.triggerType,
                trigger_config: agent.triggerConfig ?? null,
                approval_mode: agent.approvalMode,
                runner_type: agent.runnerType,
                harness: agent.harness,
                status: nextStatus,
                model_id: agent.modelId,
                environment_id: agent.environmentId,
                max_turns: agent.maxTurns,
                max_tokens: agent.maxTokens,
                variables: agent.variables,
              },
            });
          }}
          onRunAgent={(id) => {
            runAgent.mutate({ agentId: id }, {
              onSuccess: (run) => {
                onNavigate("sessions");
                setSelectedSessionId(run.id);
              },
            });
          }}
          onViewAgentLogs={() => onNavigate("sessions")}
        />
      );
    case "sessions":
      return (
        <SessionList
          sessions={sessions}
          onViewSession={setSelectedSessionId}
        />
      );
    case "environments":
      return (
        <EnvironmentList
          environments={environments}
          onCreateEnvironment={() => { setEnvEditorTarget(null); setEnvEditorOpen(true); }}
          onEditEnvironment={(id) => { setEnvEditorTarget(id); setEnvEditorOpen(true); }}
        />
      );
    case "credentials":
      return (
        <CredentialList
          credentials={credentials}
          onAddCredential={() => { setCredEditorTarget(null); setCredEditorOpen(true); }}
          onEditCredential={(id) => { setCredEditorTarget(id); setCredEditorOpen(true); }}
          onDeleteCredential={(id) => deleteCred.mutate(id)}
        />
      );
    case "integrations":
      return <IntegrationsList />;
    case "memory":
      return (
        <MemoryStoreList
          stores={memoryStores}
          onCreateStore={() => { setSelectedMemoryStoreId(null); setMemStoreEditorOpen(true); }}
          onViewStore={setSelectedMemoryStoreId}
        />
      );
    case "analytics":
      return (
        <AnalyticsDashboard
          totalSessions={sessions.length}
          completedSessions={sessions.filter((s) => s.status === "completed").length}
          failedSessions={sessions.filter((s) => s.status === "failed").length}
          totalTokens={totalTokens}
          estimatedCost={estimatedCost}
          agentBreakdown={agentBreakdown}
          dailySessions={dailySessions}
        />
      );
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Session Detail — wired subcomponent with its own turns query
   ═══════════════════════════════════════════════════════════════════════ */

function SessionDetailWired({
  session,
  onBack,
}: {
  session: SessionRecord;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const turnsQ = useAgentRunTurnsQuery(session.id);
  const turns = turnsQ.data ?? [];
  const stopRun = useStopAgentRunMutation();
  const [liveStreamingContent, setLiveStreamingContent] = useState("");
  const [liveStreamingSteps, setLiveStreamingSteps] = useState<ThinkingStepData[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    setLiveStreamingContent("");
    setLiveStreamingSteps([]);
    setLiveError(null);
  }, [session.id]);

  useEffect(() => {
    if (session.status === "completed" || session.status === "failed" || session.status === "aborted") {
      setLiveStreamingSteps((prev) => finalizeSteps(prev));
    }
  }, [session.status]);

  // Aggressively poll turns while the session is live so we catch up
  // with events that fired before this component mounted.
  const isLive = session.status === "running" || session.status === "pending";
  useEffect(() => {
    if (!isLive) return;
    // Rapid initial catch-up: refetch turns every 500ms for the first few seconds
    let count = 0;
    const interval = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: desktopQueryKeys.agentRunTurns(session.id) }).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: desktopQueryKeys.agentRuns }).catch(() => undefined);
      count++;
      if (count >= 10) clearInterval(interval); // stop after 5s
    }, 500);
    return () => clearInterval(interval);
  }, [isLive, queryClient, session.id]);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;

    void events.onAgentStream((evt: AgentStreamEvent) => {
      if (!alive || evt.session_id !== session.id) return;

      void queryClient.invalidateQueries({ queryKey: desktopQueryKeys.agentRuns }).catch(() => undefined);

      if (evt.event_type === "text_delta" && evt.content) {
        setLiveError(null);
        setLiveStreamingContent((prev) => prev + evt.content);
        return;
      }

      if (evt.event_type === "step_start" || evt.event_type === "step_update" || evt.event_type === "step_complete") {
        setLiveError(null);
        setLiveStreamingSteps((prev) => applyStreamingStepEvent(prev, evt));
        if (evt.event_type === "step_complete") {
          void queryClient.invalidateQueries({ queryKey: desktopQueryKeys.agentRunTurns(session.id) }).catch(() => undefined);
        }
        return;
      }

      if (evt.event_type === "error") {
        setLiveError(formatStreamingError(evt.content));
        setLiveStreamingSteps((prev) => finalizeSteps(prev));
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: desktopQueryKeys.agentRuns }),
          queryClient.invalidateQueries({ queryKey: desktopQueryKeys.agentRunTurns(session.id) }),
        ]).catch(() => undefined);
        return;
      }

      if (evt.event_type === "done") {
        setLiveStreamingSteps((prev) => finalizeSteps(prev));
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: desktopQueryKeys.agentRuns }),
          queryClient.invalidateQueries({ queryKey: desktopQueryKeys.agentRunTurns(session.id) }),
        ]).catch(() => undefined);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      alive = false;
      unlisten?.();
    };
  }, [queryClient, session.id]);

  const showLiveState = session.status === "running" || session.status === "pending";

  return (
    <SessionDetail
      session={session}
      turns={turns}
      liveStreamingContent={showLiveState ? liveStreamingContent : ""}
      liveStreamingSteps={showLiveState ? liveStreamingSteps : []}
      liveError={liveError}
      onBack={onBack}
      onAbort={() => {
        stopRun.mutate(session.id);
      }}
      onRetry={() => {
        console.log("[WorkArea] Retry session:", session.id);
      }}
      onSendMessage={(msg) => {
        console.log("[WorkArea] Send to session:", session.id, msg);
      }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Memory Store Detail — wired subcomponent with entries query
   ═══════════════════════════════════════════════════════════════════════ */

function MemoryStoreDetailWired({
  store,
  onBack,
  onAddEntry,
  showEntryEditor,
  onCloseEntryEditor,
}: {
  store: MemoryStore;
  onBack: () => void;
  onAddEntry: () => void;
  showEntryEditor: boolean;
  onCloseEntryEditor: () => void;
}) {
  const entriesQ = useMemoryEntriesQuery(store.id);
  const entries: MemoryEntry[] = entriesQ.data ?? [];
  const createEntry = useCreateMemoryEntryMutation();
  const deleteEntry = useDeleteMemoryEntryMutation();

  return (
    <MemoryStoreDetail
      store={store}
      entries={entries}
      onBack={onBack}
      onAddEntry={onAddEntry}
      onDeleteEntry={(id) => deleteEntry.mutate({ id, storeId: store.id })}
      addEntrySlot={
        showEntryEditor ? (
          <MemoryEntryEditor
            onSave={async (data) => {
              await createEntry.mutateAsync({
                store_id: store.id,
                key: data.key,
                content: data.content,
              });
              onCloseEntryEditor();
            }}
            onCancel={onCloseEntryEditor}
          />
        ) : undefined
      }
    />
  );
}
