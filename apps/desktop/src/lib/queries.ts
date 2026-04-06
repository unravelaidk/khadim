import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commands } from "./bindings";
import type { CreateWorkspaceInput } from "./bindings";

export const desktopQueryKeys = {
  runtimeSummary: ["runtime-summary"] as const,
  githubAuthStatus: ["github-auth-status"] as const,
  workspaces: ["workspaces"] as const,
  workspace: (workspaceId: string | null) => ["workspace", workspaceId] as const,
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
      if (backend === "opencode" && connected) return commands.opencodeListModels(workspaceId);
      return Promise.resolve([]);
    },
    enabled: enabled && Boolean(workspaceId) && Boolean(backend) && (backend === "khadim" || connected),
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
    mutationFn: ({ id, backendSessionId }: { workspaceId: string; id: string; backendSessionId: string }) =>
      commands.setConversationBackendSession(id, backendSessionId),
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
