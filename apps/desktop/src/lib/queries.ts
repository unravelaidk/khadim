import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commands } from "./bindings";
import type {
  CreateWorkspaceInput,
  ManagedAgentRecord,
  UpsertManagedAgentInput,
  EnvironmentProfile,
  UpsertEnvironmentInput,
  CredentialRecord,
  UpsertCredentialInput,
  MemoryStoreRecord,
  UpsertMemoryStoreInput,
  MemoryEntryRecord,
  CreateMemoryEntryInput,
  AgentRunRecord,
  AgentRunTurnRecord,
} from "./bindings";
import type {
  ManagedAgent,
  SessionRecord,
  SessionTurn,
  Environment,
  Credential,
  MemoryStore,
  MemoryEntry,
} from "./types";

/* ═══════════════════════════════════════════════════════════════════
   Record ↔ UI type converters (snake_case ↔ camelCase)
   ═══════════════════════════════════════════════════════════════════ */

export function agentRecordToUI(r: ManagedAgentRecord): ManagedAgent {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    instructions: r.instructions,
    tools: r.tools,
    triggerType: r.trigger_type,
    triggerConfig: r.trigger_config ?? undefined,
    approvalMode: r.approval_mode,
    runnerType: r.runner_type,
    harness: r.harness,
    status: r.status,
    modelId: r.model_id ?? null,
    environmentId: r.environment_id ?? null,
    maxTurns: r.max_turns,
    maxTokens: r.max_tokens,
    variables: r.variables,
    version: r.version,
    stats: {
      totalSessions: r.total_sessions,
      successRate: r.success_rate,
      lastRunAt: r.last_run_at ?? null,
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function environmentRecordToUI(r: EnvironmentProfile): Environment {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    variables: r.variables,
    credentialIds: r.credential_ids,
    runnerType: r.runner_type,
    dockerImage: r.docker_image,
    isDefault: r.is_default,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function credentialRecordToUI(r: CredentialRecord): Credential {
  return {
    id: r.id,
    name: r.name,
    type: r.credential_type,
    service: r.service,
    metadata: r.metadata,
    lastUsedAt: r.last_used_at,
    usedByAgents: r.used_by_agents,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function memoryStoreRecordToUI(r: MemoryStoreRecord): MemoryStore {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    scopeType: r.scope_type,
    name: r.name,
    description: r.description,
    chatReadAccess: r.chat_read_access,
    linkedAgentIds: r.linked_agent_ids,
    linkedAgentNames: r.linked_agent_names,
    primaryForAgentIds: r.primary_for_agent_ids,
    entryCount: r.entry_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function memoryEntryRecordToUI(r: MemoryEntryRecord): MemoryEntry {
  return {
    id: r.id,
    storeId: r.store_id,
    key: r.key,
    content: r.content,
    kind: r.kind,
    sourceSessionId: r.source_session_id,
    sourceConversationId: r.source_conversation_id,
    sourceMessageId: r.source_message_id,
    confidence: r.confidence,
    recallCount: r.recall_count,
    lastRecalledAt: r.last_recalled_at,
    isPinned: r.is_pinned,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function agentRunRecordToUI(r: AgentRunRecord): SessionRecord {
  return {
    id: r.id,
    agentId: r.agent_id,
    agentName: r.agent_name,
    automationId: r.automation_id,
    environmentId: r.environment_id,
    status: r.status,
    trigger: r.trigger,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMs: r.duration_ms,
    resultSummary: r.result_summary,
    errorMessage: r.error_message,
    tokenUsage: (r.input_tokens != null && r.output_tokens != null)
      ? { inputTokens: r.input_tokens, outputTokens: r.output_tokens }
      : null,
  };
}

export function agentRunTurnRecordToUI(r: AgentRunTurnRecord): SessionTurn {
  return {
    id: r.id,
    turnNumber: r.turn_number,
    role: r.role,
    toolName: r.tool_name,
    content: r.content,
    tokenInput: r.token_input,
    tokenOutput: r.token_output,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
  };
}

export const desktopQueryKeys = {
  runtimeSummary: ["runtime-summary"] as const,
  githubAuthStatus: ["github-auth-status"] as const,
  workspaces: ["workspaces"] as const,
  workspace: (workspaceId: string | null) => ["workspace", workspaceId] as const,
  workspaceContext: (workspaceId: string | null, conversationId: string | null) =>
    ["workspace-context", workspaceId, conversationId] as const,
  workspaceConnection: (workspaceId: string | null) => ["workspace-connection", workspaceId] as const,
  providerStatuses: ["provider-statuses"] as const,
  conversations: (workspaceId: string | null) => ["conversations", workspaceId] as const,
  messages: (conversationId: string | null) => ["messages", conversationId] as const,
  gitBranches: (repoPath: string | null) => ["git-branches", repoPath] as const,
  gitStatus: (repoPath: string | null) => ["git-status", repoPath] as const,
  gitDiffStat: (repoPath: string | null) => ["git-diff-stat", repoPath] as const,
  setting: (key: string | null) => ["setting", key] as const,
  workspaceModels: (workspaceId: string | null, backend: string | null, connected: boolean) => ["workspace-models", workspaceId, backend, connected] as const,
  khadimActiveModel: ["khadim-active-model"] as const,
  githubSlug: (repoPath: string | null) => ["github-slug", repoPath] as const,
  githubIssues: (owner: string, repo: string, state: string) => ["github-issues", owner, repo, state] as const,
  // RPA platform
  managedAgents: ["managed-agents"] as const,
  environments: ["environments"] as const,
  credentials: ["credentials"] as const,
  memoryStores: ["memory-stores"] as const,
  workspaceMemoryStores: (workspaceId: string | null) => ["memory-stores", "workspace", workspaceId] as const,
  agentMemoryStores: (agentId: string | null) => ["memory-stores", "agent", agentId] as const,
  chatMemoryStore: (workspaceId: string | null) => ["memory-stores", "chat", workspaceId] as const,
  memoryEntries: (storeId: string | null) => ["memory-entries", storeId] as const,
  agentRuns: ["agent-runs"] as const,
  agentRunTurns: (runId: string | null) => ["agent-run-turns", runId] as const,
};

export function useRuntimeSummaryQuery() {
  return useQuery({
    queryKey: desktopQueryKeys.runtimeSummary,
    queryFn: () => commands.getRuntimeSummary(),
  });
}

export function useGitHubAuthStatusQuery(enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.githubAuthStatus,
    queryFn: () => commands.githubAuthStatus(),
    enabled,
  });
}

export function useWorkspacesQuery() {
  return useQuery({
    queryKey: desktopQueryKeys.workspaces,
    queryFn: () => commands.listWorkspaces(),
  });
}

export function useWorkspaceQuery(workspaceId: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.workspace(workspaceId),
    queryFn: () => {
      if (!workspaceId) return Promise.resolve(null);
      return commands.getWorkspace(workspaceId);
    },
    enabled: enabled && Boolean(workspaceId),
  });
}

export function useWorkspaceContextQuery(
  workspaceId: string | null,
  conversationId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: desktopQueryKeys.workspaceContext(workspaceId, conversationId),
    queryFn: () => {
      if (!workspaceId) return Promise.resolve(null);
      return commands.workspaceContextGet(workspaceId, conversationId);
    },
    enabled: enabled && Boolean(workspaceId),
  });
}

export function useWorkspaceConnectionQuery(
  workspaceId: string | null,
  backend: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: desktopQueryKeys.workspaceConnection(workspaceId),
    queryFn: () => {
      if (!workspaceId || backend !== "opencode") return Promise.resolve(null);
      return commands.opencodeGetConnection(workspaceId);
    },
    enabled: enabled && Boolean(workspaceId) && backend === "opencode",
  });
}

export function useProviderStatusesQuery(enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.providerStatuses,
    queryFn: () => commands.khadimListProviderStatuses(),
    enabled,
  });
}

export function useConversationsQuery(workspaceId: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.conversations(workspaceId),
    queryFn: () => {
      if (!workspaceId) return Promise.resolve([]);
      return commands.listConversations(workspaceId);
    },
    enabled: enabled && Boolean(workspaceId),
  });
}

export function useMessagesQuery(conversationId: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.messages(conversationId),
    queryFn: () => {
      if (!conversationId) return Promise.resolve([]);
      return commands.listMessages(conversationId);
    },
    enabled: enabled && Boolean(conversationId),
  });
}

export function useGitBranchesQuery(repoPath: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.gitBranches(repoPath),
    queryFn: () => {
      if (!repoPath) return Promise.resolve([]);
      return commands.gitListBranches(repoPath);
    },
    enabled: enabled && Boolean(repoPath),
  });
}

export function useGitStatusQuery(repoPath: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.gitStatus(repoPath),
    queryFn: () => {
      if (!repoPath) return Promise.resolve("");
      return commands.gitStatus(repoPath).catch(() => "");
    },
    enabled: enabled && Boolean(repoPath),
  });
}

export function useGitDiffStatQuery(repoPath: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.gitDiffStat(repoPath),
    queryFn: () => {
      if (!repoPath) return Promise.resolve("");
      return commands.gitDiffStat(repoPath).catch(() => "");
    },
    enabled: enabled && Boolean(repoPath),
  });
}

export function useSettingQuery(key: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.setting(key),
    queryFn: () => {
      if (!key) return Promise.resolve(null);
      return commands.getSetting(key);
    },
    enabled: enabled && Boolean(key),
  });
}

export function useWorkspaceModelsQuery(
  workspaceId: string | null,
  backend: string | null,
  connected: boolean,
  enabled = true,
) {
  return useQuery({
    queryKey: desktopQueryKeys.workspaceModels(workspaceId, backend, connected),
    queryFn: () => {
      if (!workspaceId || !backend) return Promise.resolve([]);
      if (backend === "khadim") return commands.khadimListModels();
      if (backend === "claude_code") return commands.claudeCodeListModels();
      if (backend === "opencode" && connected) return commands.opencodeListModels(workspaceId);
      return Promise.resolve([]);
    },
    enabled: enabled && Boolean(workspaceId) && Boolean(backend) && (backend === "khadim" || backend === "claude_code" || connected),
  });
}

export function useKhadimActiveModelQuery(enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.khadimActiveModel,
    queryFn: () => commands.khadimActiveModel(),
    enabled,
  });
}

export function useGitHubSlugQuery(repoPath: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.githubSlug(repoPath),
    queryFn: async () => {
      if (!repoPath) return null;
      try {
        const info = await commands.gitRepoInfo(repoPath);
        if (!info.remote_url) return null;
        return await commands.githubRepoSlug(info.remote_url);
      } catch {
        return null;
      }
    },
    enabled: enabled && Boolean(repoPath),
  });
}

export function useCreateWorkspaceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => commands.createWorkspace(input),
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: desktopQueryKeys.workspaces });
      queryClient.setQueryData(desktopQueryKeys.workspace(workspace.id), workspace);
    },
  });
}

export function useDeleteWorkspaceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => commands.deleteWorkspace(id),
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: desktopQueryKeys.workspaces });
      queryClient.removeQueries({ queryKey: desktopQueryKeys.workspace(id) });
      queryClient.removeQueries({ queryKey: desktopQueryKeys.conversations(id) });
      queryClient.removeQueries({ queryKey: desktopQueryKeys.workspaceConnection(id) });
    },
  });
}

export function useSetWorkspaceBranchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, branch }: { id: string; branch?: string }) => commands.setWorkspaceBranch(id, branch),
    onSuccess: async (_, { id }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: desktopQueryKeys.workspaces }),
        queryClient.invalidateQueries({ queryKey: desktopQueryKeys.workspace(id) }),
      ]);
    },
  });
}

export function useStartOpenCodeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => commands.opencodeStart(workspaceId),
    onSuccess: async (_, workspaceId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: desktopQueryKeys.workspaceConnection(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: ["workspace-models", workspaceId] }),
      ]);
    },
  });
}

export function useStopOpenCodeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => commands.opencodeStop(workspaceId),
    onSuccess: async (_, workspaceId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: desktopQueryKeys.workspaceConnection(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: ["workspace-models", workspaceId] }),
      ]);
    },
  });
}

export function useCreateConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => commands.createConversation(workspaceId),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: desktopQueryKeys.conversations(conversation.workspace_id) });
    },
  });
}

export function useDeleteConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { workspaceId: string; id: string }) => commands.deleteConversation(id),
    onSuccess: async (_, { workspaceId, id }) => {
      await queryClient.invalidateQueries({ queryKey: desktopQueryKeys.conversations(workspaceId) });
      queryClient.removeQueries({ queryKey: desktopQueryKeys.messages(id) });
    },
  });
}

export function useSetConversationBackendSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      backendSessionId,
      backendSessionCwd,
      branch,
      worktreePath,
    }: {
      workspaceId: string;
      id: string;
      backendSessionId: string;
      backendSessionCwd?: string | null;
      branch?: string | null;
      worktreePath?: string | null;
    }) => commands.setConversationBackendSession(
      id,
      backendSessionId,
      backendSessionCwd,
      branch,
      worktreePath,
    ),
    onSuccess: async (_, { workspaceId }) => {
      await queryClient.invalidateQueries({ queryKey: desktopQueryKeys.conversations(workspaceId) });
    },
  });
}

export function useSetSettingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => commands.setSetting(key, value),
    onSuccess: async (_, { key }) => {
      await queryClient.invalidateQueries({ queryKey: desktopQueryKeys.setting(key) });
    },
  });
}

export function useGitHubIssuesQuery(
  owner: string | null,
  repo: string | null,
  state: "open" | "closed" | "all" = "open",
  enabled = true,
) {
  return useQuery({
    queryKey: desktopQueryKeys.githubIssues(owner ?? "", repo ?? "", state),
    queryFn: () => {
      if (!owner || !repo) return Promise.resolve([]);
      return commands.githubIssueList(owner, repo, state, 1, 50);
    },
    enabled: enabled && Boolean(owner) && Boolean(repo),
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   RPA Platform Queries & Mutations
   ═══════════════════════════════════════════════════════════════════════ */

// ── Managed Agents ───────────────────────────────────────────────────

export function useManagedAgentsQuery(enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.managedAgents,
    queryFn: async () => {
      const records = await commands.listManagedAgents();
      return records.map(agentRecordToUI);
    },
    enabled,
  });
}

export function useCreateManagedAgentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertManagedAgentInput) => commands.createManagedAgent(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: desktopQueryKeys.managedAgents }),
  });
}

export function useUpdateManagedAgentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertManagedAgentInput }) =>
      commands.updateManagedAgent(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: desktopQueryKeys.managedAgents }),
  });
}

export function useDeleteManagedAgentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => commands.deleteManagedAgent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: desktopQueryKeys.managedAgents });
      qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores });
    },
  });
}

// ── Environments ─────────────────────────────────────────────────────

export function useEnvironmentsQuery(enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.environments,
    queryFn: async () => {
      const records = await commands.listEnvironments();
      return records.map(environmentRecordToUI);
    },
    enabled,
  });
}

export function useCreateEnvironmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertEnvironmentInput) => commands.createEnvironment(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: desktopQueryKeys.environments }),
  });
}

export function useUpdateEnvironmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertEnvironmentInput }) =>
      commands.updateEnvironment(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: desktopQueryKeys.environments }),
  });
}

export function useDeleteEnvironmentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => commands.deleteEnvironment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: desktopQueryKeys.environments }),
  });
}

// ── Credentials ──────────────────────────────────────────────────────

export function useCredentialsQuery(enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.credentials,
    queryFn: async () => {
      const records = await commands.listCredentials();
      return records.map(credentialRecordToUI);
    },
    enabled,
  });
}

export function useCreateCredentialMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertCredentialInput) => commands.createCredential(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: desktopQueryKeys.credentials }),
  });
}

export function useUpdateCredentialMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertCredentialInput }) =>
      commands.updateCredential(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: desktopQueryKeys.credentials }),
  });
}

export function useDeleteCredentialMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => commands.deleteCredential(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: desktopQueryKeys.credentials });
      qc.invalidateQueries({ queryKey: desktopQueryKeys.environments });
    },
  });
}

// ── Memory Stores ────────────────────────────────────────────────────

export function useMemoryStoresQuery(enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.memoryStores,
    queryFn: async () => {
      const records = await commands.listMemoryStores();
      return records.map(memoryStoreRecordToUI);
    },
    enabled,
  });
}

export function useWorkspaceMemoryStoresQuery(workspaceId: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.workspaceMemoryStores(workspaceId),
    queryFn: async () => {
      const records = await commands.listMemoryStores(workspaceId);
      return records.map(memoryStoreRecordToUI);
    },
    enabled: enabled && workspaceId !== undefined,
  });
}

export function useAgentMemoryStoresQuery(agentId: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.agentMemoryStores(agentId),
    queryFn: async () => {
      if (!agentId) return [];
      const records = await commands.listAgentMemoryStores(agentId);
      return records.map(memoryStoreRecordToUI);
    },
    enabled: enabled && Boolean(agentId),
  });
}

export function useChatMemoryStoreQuery(workspaceId: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.chatMemoryStore(workspaceId),
    queryFn: async () => memoryStoreRecordToUI(await commands.getOrCreateChatMemoryStore(workspaceId)),
    enabled,
  });
}

export function useLinkMemoryStoreToAgentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storeId, agentId, isPrimaryWriteTarget }: { storeId: string; agentId: string; isPrimaryWriteTarget?: boolean | null }) =>
      commands.linkMemoryStoreToAgent(storeId, agentId, isPrimaryWriteTarget),
    onSuccess: async (_, { agentId }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores }),
        qc.invalidateQueries({ queryKey: desktopQueryKeys.agentMemoryStores(agentId) }),
      ]);
    },
  });
}

export function useUnlinkMemoryStoreFromAgentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storeId, agentId }: { storeId: string; agentId: string }) =>
      commands.unlinkMemoryStoreFromAgent(storeId, agentId),
    onSuccess: async (_, { agentId }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores }),
        qc.invalidateQueries({ queryKey: desktopQueryKeys.agentMemoryStores(agentId) }),
      ]);
    },
  });
}

export function useSetAgentPrimaryMemoryStoreMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storeId, agentId }: { storeId: string; agentId: string }) =>
      commands.setAgentPrimaryMemoryStore(storeId, agentId),
    onSuccess: async (_, { agentId }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores }),
        qc.invalidateQueries({ queryKey: desktopQueryKeys.agentMemoryStores(agentId) }),
      ]);
    },
  });
}

export function useUpdateMemoryEntryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateMemoryEntryInput }) => commands.updateMemoryEntry(id, input),
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryEntries(entry.store_id) });
      qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores });
    },
  });
}

export function useCreateMemoryStoreMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertMemoryStoreInput) => commands.createMemoryStore(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores }),
  });
}

export function useUpdateMemoryStoreMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertMemoryStoreInput }) =>
      commands.updateMemoryStore(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores }),
  });
}

export function useDeleteMemoryStoreMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => commands.deleteMemoryStore(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores }),
  });
}

// ── Memory Entries ───────────────────────────────────────────────────

export function useMemoryEntriesQuery(storeId: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.memoryEntries(storeId),
    queryFn: async () => {
      if (!storeId) return [];
      const records = await commands.listMemoryEntries(storeId);
      return records.map(memoryEntryRecordToUI);
    },
    enabled: enabled && Boolean(storeId),
  });
}

export function useCreateMemoryEntryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMemoryEntryInput) => commands.createMemoryEntry(input),
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryEntries(entry.store_id) });
      qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores });
    },
  });
}

export function useDeleteMemoryEntryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, storeId }: { id: string; storeId: string }) =>
      commands.deleteMemoryEntry(id).then(() => storeId),
    onSuccess: (storeId) => {
      qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryEntries(storeId) });
      qc.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores });
    },
  });
}

// ── Agent Runs / Sessions ────────────────────────────────────────────

export function useAgentRunsQuery(enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.agentRuns,
    queryFn: async () => {
      const records = await commands.listAgentRuns();
      return records.map(agentRunRecordToUI);
    },
    enabled,
    // Auto-refresh for live sessions
    refetchInterval: 5000,
  });
}

export function useAgentRunTurnsQuery(runId: string | null, enabled = true) {
  return useQuery({
    queryKey: desktopQueryKeys.agentRunTurns(runId),
    queryFn: async () => {
      if (!runId) return [];
      const records = await commands.listAgentRunTurns(runId);
      return records.map(agentRunTurnRecordToUI);
    },
    enabled: enabled && Boolean(runId),
    refetchInterval: (query) => {
      // Refetch faster while viewing a live session
      return 3000;
    },
  });
}

// ── Model list for agent editor ──────────────────────────────────────

export function useAgentEditorModelsQuery(enabled = true) {
  return useQuery({
    queryKey: ["agent-editor-models"] as const,
    queryFn: async () => {
      try {
        return await commands.khadimListModels();
      } catch {
        return [];
      }
    },
    enabled,
  });
}

export function useRunManagedAgentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, trigger }: { agentId: string; trigger?: string }) =>
      commands.runManagedAgent(agentId, trigger),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: desktopQueryKeys.agentRuns });
    },
  });
}

export function useStopAgentRunMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => commands.stopAgentRun(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: desktopQueryKeys.agentRuns });
    },
  });
}

export function useDockerAvailableQuery(enabled = true) {
  return useQuery({
    queryKey: ["docker-available"] as const,
    queryFn: () => commands.checkDockerAvailable(),
    enabled,
    staleTime: 30_000,
  });
}
