import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  CreateWorkspaceInput,
  OpenCodeConnection,
  OpenCodeModelOption,
  OpenCodeModelRef,
  Workspace,
} from "../lib/bindings";
import { commands } from "../lib/bindings";
import {
  useCreateConversationMutation,
  useCreateEnvironmentMutation,
  useCreateRuntimeSessionMutation,
  useCreateWorkspaceMutation,
  useDeleteConversationMutation,
  useDeleteWorkspaceMutation,
  useSetConversationBackendSessionMutation,
  useSetConversationEnvironmentMutation,
  useSetSettingMutation,
  useSetWorkspaceBranchMutation,
  useStartOpenCodeMutation,
  useStopOpenCodeMutation,
} from "../lib/queries";
import { getModelSettingKey } from "../lib/model-selection";
import type { AgentInstance, WorkHomeView } from "../lib/types";
import { createAgentInstance } from "../lib/types";
import { extractSessionId } from "../lib/ui";

function normalizeWorktreePath(path: string | null): string | null {
  const trimmed = path?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\\/g, "/").replace(/\/+$/, "");
}

interface UseWorkspaceActionsArgs {
  selectedWorkspace: Workspace | null;
  selectedWorkspaceId: string | null;
  connection: OpenCodeConnection | null;
  selectedModelOption: OpenCodeModelOption | null;
  availableModels: OpenCodeModelOption[];
  agents: AgentInstance[];
  focusedAgentId: string | null;
  agentSettingsTarget: string | null;
  inWorkspace: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
  setInWorkspace: Dispatch<SetStateAction<boolean>>;
  setWorkView: Dispatch<SetStateAction<WorkHomeView>>;
  setSelectedWorkspaceId: Dispatch<SetStateAction<string | null>>;
  setSelectedConversationId: Dispatch<SetStateAction<string | null>>;
  setFocusedAgentId: Dispatch<SetStateAction<string | null>>;
  setAgents: Dispatch<SetStateAction<AgentInstance[]>>;
  setSelectedModelOverride: Dispatch<SetStateAction<OpenCodeModelRef | null>>;
  setAgentSettingsTarget: Dispatch<SetStateAction<string | null>>;
  getErrorMessage: (error: unknown) => string;
}

export function useWorkspaceActions({
  selectedWorkspace,
  selectedWorkspaceId,
  connection,
  selectedModelOption,
  availableModels,
  agents,
  focusedAgentId,
  agentSettingsTarget,
  inWorkspace,
  setError,
  setInWorkspace,
  setWorkView,
  setSelectedWorkspaceId,
  setSelectedConversationId,
  setFocusedAgentId,
  setAgents,
  setSelectedModelOverride,
  setAgentSettingsTarget,
  getErrorMessage,
}: UseWorkspaceActionsArgs) {
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const createWorkspaceMutation = useCreateWorkspaceMutation();
  const deleteWorkspaceMutation = useDeleteWorkspaceMutation();
  const setWorkspaceBranchMutation = useSetWorkspaceBranchMutation();
  const startOpenCodeMutation = useStartOpenCodeMutation();
  const stopOpenCodeMutation = useStopOpenCodeMutation();
  const createConversationMutation = useCreateConversationMutation();
  const deleteConversationMutation = useDeleteConversationMutation();
  const setConversationBackendSessionMutation = useSetConversationBackendSessionMutation();
  const createEnvironmentMutation = useCreateEnvironmentMutation();
  const createRuntimeSessionMutation = useCreateRuntimeSessionMutation();
  const setConversationEnvironmentMutation = useSetConversationEnvironmentMutation();
  const setSettingMutation = useSetSettingMutation();

  const handleCreateWorkspace = useCallback(async (input: CreateWorkspaceInput) => {
    setError(null);
    try {
      const created = await createWorkspaceMutation.mutateAsync(input);
      setSelectedWorkspaceId(created.id);
      setInWorkspace(true);
    } catch (error) {
      setError(getErrorMessage(error));
      throw error;
    }
  }, [createWorkspaceMutation, getErrorMessage, setError, setInWorkspace, setSelectedWorkspaceId]);

  const handleDeleteWorkspace = useCallback(async (id: string) => {
    try {
      if (id === selectedWorkspaceId) {
        setInWorkspace(false);
        setWorkView("workspaces");
        setSelectedWorkspaceId(null);
      }
      await deleteWorkspaceMutation.mutateAsync(id);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [deleteWorkspaceMutation, getErrorMessage, selectedWorkspaceId, setError, setInWorkspace, setSelectedWorkspaceId, setWorkView]);

  const handleWorkspaceBranchChange = useCallback(async (branch: string) => {
    if (!selectedWorkspace) return;
    await setWorkspaceBranchMutation.mutateAsync({ id: selectedWorkspace.id, branch });
  }, [selectedWorkspace, setWorkspaceBranchMutation]);

  const ensureOpenCodeStarted = useCallback(async (workspace: Workspace) => {
    if (connection) return connection;
    await startOpenCodeMutation.mutateAsync(workspace.id);
    return await commands.opencodeGetConnection(workspace.id);
  }, [connection, startOpenCodeMutation]);

  const handleStartOpenCode = useCallback(async () => {
    if (!selectedWorkspace) return;
    setError(null);
    try {
      await ensureOpenCodeStarted(selectedWorkspace);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }, [ensureOpenCodeStarted, getErrorMessage, selectedWorkspace, setError]);

  const handleStopOpenCode = useCallback(async () => {
    if (!selectedWorkspace) return;
    setError(null);
    try {
      await stopOpenCodeMutation.mutateAsync(selectedWorkspace.id);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }, [getErrorMessage, selectedWorkspace, setError, stopOpenCodeMutation]);

  const handleNewConversation = useCallback(async () => {
    if (!selectedWorkspace) return null;
    setError(null);
    try {
      if (selectedWorkspace.backend === "opencode") {
        await ensureOpenCodeStarted(selectedWorkspace);
      }

      const conversation = await createConversationMutation.mutateAsync(selectedWorkspace.id);
      let updatedConversation = conversation;

      if (selectedWorkspace.backend === "opencode") {
        const session = await commands.opencodeCreateSession(selectedWorkspace.id);
        const sessionId = extractSessionId(session);
        if (!sessionId) {
          throw new Error("OpenCode session created but no session ID was returned.");
        }
        await setConversationBackendSessionMutation.mutateAsync({
          workspaceId: selectedWorkspace.id,
          id: conversation.id,
          backendSessionId: sessionId,
          backendSessionCwd: selectedWorkspace.worktree_path ?? selectedWorkspace.repo_path,
          branch: selectedWorkspace.branch ?? null,
          worktreePath: selectedWorkspace.worktree_path ?? null,
        });
        updatedConversation = { ...conversation, backend_session_id: sessionId };
      } else if (selectedWorkspace.backend === "claude_code") {
        const session = await commands.claudeCodeCreateSession(selectedWorkspace.id);
        await setConversationBackendSessionMutation.mutateAsync({
          workspaceId: selectedWorkspace.id,
          id: conversation.id,
          backendSessionId: session.id,
          backendSessionCwd: selectedWorkspace.worktree_path ?? selectedWorkspace.repo_path,
          branch: selectedWorkspace.branch ?? null,
          worktreePath: selectedWorkspace.worktree_path ?? null,
        });
        updatedConversation = { ...conversation, backend_session_id: session.id };
      } else if (selectedWorkspace.backend === "khadim") {
        const session = await commands.khadimCreateSession(selectedWorkspace.id);
        await setConversationBackendSessionMutation.mutateAsync({
          workspaceId: selectedWorkspace.id,
          id: conversation.id,
          backendSessionId: session.id,
          backendSessionCwd: session.cwd,
          branch: selectedWorkspace.branch ?? null,
          worktreePath: selectedWorkspace.worktree_path ?? null,
        });
        updatedConversation = { ...conversation, backend_session_id: session.id };
      }

      setSelectedConversationId(updatedConversation.id);
      const modelLabel = selectedModelOption ? selectedModelOption.model_name : null;
      const newAgent = createAgentInstance(
        updatedConversation.id,
        selectedWorkspaceId!,
        `Agent ${agents.length + 1}`,
        updatedConversation.backend_session_id ?? null,
        modelLabel,
        selectedWorkspace.branch ?? null,
        selectedWorkspace.worktree_path ?? null,
      );
      setAgents((prev) => [...prev, newAgent]);
      setFocusedAgentId(updatedConversation.id);

      if (!inWorkspace) {
        setInWorkspace(true);
      }

      return updatedConversation;
    } catch (error) {
      setError(getErrorMessage(error));
      return null;
    }
  }, [
    agents.length,
    createConversationMutation,
    ensureOpenCodeStarted,
    getErrorMessage,
    inWorkspace,
    selectedModelOption,
    selectedWorkspace,
    setAgents,
    setError,
    setFocusedAgentId,
    setInWorkspace,
    setSelectedConversationId,
    setConversationBackendSessionMutation,
  ]);

  const handleSelectModel = useCallback(async (modelKey: string) => {
    if (!selectedWorkspaceId) return;
    const next = availableModels.find((model) => `${model.provider_id}:${model.model_id}` === modelKey);
    if (!next) return;
    const value = { provider_id: next.provider_id, model_id: next.model_id };
    setSelectedModelOverride(value);
    await setSettingMutation.mutateAsync({
      key: getModelSettingKey(selectedWorkspaceId),
      value: JSON.stringify(value),
    });
  }, [availableModels, selectedWorkspaceId, setSelectedModelOverride, setSettingMutation]);

  const handleRemoveAgent = useCallback(async (agentId: string, deleteWorktree = true) => {
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) return;

    const normalizedWorktreePath = normalizeWorktreePath(agent.worktreePath);
    const nextAgents = agents.filter((candidate) => candidate.id !== agentId);
    const sharedWorktreeCount = normalizedWorktreePath == null
      ? 0
      : nextAgents.filter((candidate) => normalizeWorktreePath(candidate.worktreePath) === normalizedWorktreePath).length;

    if (agent.status === "running" && agent.sessionId && selectedWorkspace) {
      if (selectedWorkspace.backend === "khadim") {
        await commands.khadimAbort(agent.sessionId).catch(() => {});
      } else if (selectedWorkspace.backend === "claude_code") {
        await commands.claudeCodeAbort(agent.sessionId).catch(() => {});
      } else {
        await commands.opencodeAbort(selectedWorkspace.id, agent.sessionId).catch(() => {});
      }
    }

    if (selectedWorkspace) {
      await deleteConversationMutation.mutateAsync({ workspaceId: selectedWorkspace.id, id: agentId }).catch(() => {});
    }

    if (deleteWorktree && normalizedWorktreePath && selectedWorkspace && sharedWorktreeCount === 0) {
      await commands.gitRemoveWorktree(selectedWorkspace.repo_path, normalizedWorktreePath, false).catch(() => {});
    }

    setAgents(nextAgents);

    if (deleteWorktree && normalizedWorktreePath && sharedWorktreeCount > 0) {
      setError(`Agent deleted. Kept shared worktree because ${sharedWorktreeCount} other agent${sharedWorktreeCount === 1 ? " still uses it" : "s still use it"}.`);
    }

    if (focusedAgentId === agentId) {
      const nextFocusId = nextAgents.length > 0 ? nextAgents[nextAgents.length - 1].id : null;
      setFocusedAgentId(nextFocusId);
      setSelectedConversationId(nextFocusId);
    }

    if (agentSettingsTarget === agentId) {
      setAgentSettingsTarget(null);
    }
  }, [
    agentSettingsTarget,
    agents,
    deleteConversationMutation,
    focusedAgentId,
    selectedWorkspace,
    setAgentSettingsTarget,
    setAgents,
    setError,
    setFocusedAgentId,
    setSelectedConversationId,
  ]);

  const handleCreateAgentWithWorktree = useCallback(async (
    branch: string,
    worktreePath: string,
    label: string,
    issueUrl: string | null,
    envChoice: {
      envMode: "fresh" | "existing";
      environmentSubstrate: "local" | "docker" | "remote";
      environmentWasmEnabled: boolean;
      environmentId: string | null;
      sessionMode: "new" | "shared";
      runtimeSessionId: string | null;
    } = { envMode: "fresh", environmentSubstrate: "local", environmentWasmEnabled: false, environmentId: null, sessionMode: "new", runtimeSessionId: null },
  ) => {
    if (!selectedWorkspace) return;
    setIsCreatingAgent(true);
    setError(null);
    try {
      if (selectedWorkspace.backend === "opencode") {
        await ensureOpenCodeStarted(selectedWorkspace);
      }

      // Resolve the target environment first. It defines the isolation model.
      let environment = envChoice.environmentId
        ? await commands.getEnvironment(envChoice.environmentId).catch(() => null)
        : null;
      if (envChoice.envMode === "fresh") {
        environment = await createEnvironmentMutation.mutateAsync({
          workspace_id: selectedWorkspace.id,
          name: label,
          backend: selectedWorkspace.backend,
          substrate: envChoice.environmentSubstrate,
          wasm_enabled: envChoice.environmentWasmEnabled,
          source_cwd: worktreePath,
        }).catch(() => null);
      }
      const environmentId = environment?.id ?? null;
      const executionCwd = environment?.effective_cwd ?? worktreePath;
      const executionBranch = branch;
      const executionWorktreePath = worktreePath;

      const conversation = await createConversationMutation.mutateAsync(selectedWorkspace.id);
      let updatedConversation = conversation;

      // Resolve the runtime session first. Backend session identity comes from
      // a shared runtime session, a newly created runtime session, or a direct
      // backend session fallback when no runtime session has an identity yet.
      let runtimeSessionId: string | null = envChoice.runtimeSessionId;
      let runtimeSession = runtimeSessionId
        ? await commands.getRuntimeSession(runtimeSessionId).catch(() => null)
        : null;

      if (envChoice.sessionMode === "new" && environmentId) {
        runtimeSession = await createRuntimeSessionMutation.mutateAsync({
          environment_id: environmentId,
          source_cwd: worktreePath,
          shared: false,
          status: issueUrl ? "running" : "idle",
        }).catch(() => null);
        runtimeSessionId = runtimeSession?.id ?? null;
      }

      let backendSessionId: string | null = null;
      let backendSessionCwd: string | null = runtimeSession?.backend_session_cwd ?? executionCwd;

      if (envChoice.sessionMode === "shared") {
        backendSessionId = runtimeSession?.backend_session_id ?? null;
        backendSessionCwd = runtimeSession?.backend_session_cwd ?? executionCwd;
        if (!backendSessionId && runtimeSessionId) {
          throw new Error("The selected shared session is not ready yet.");
        }
      }

      if (!backendSessionId && envChoice.sessionMode === "new") {
        if (selectedWorkspace.backend === "opencode") {
          const session = await commands.opencodeCreateSession(selectedWorkspace.id);
          const sessionId = extractSessionId(session);
          if (!sessionId) {
            throw new Error("OpenCode session created but no session ID was returned.");
          }
          backendSessionId = sessionId;
        } else if (selectedWorkspace.backend === "claude_code") {
          const session = await commands.claudeCodeCreateSession(selectedWorkspace.id, executionCwd);
          backendSessionId = session.id;
        } else if (selectedWorkspace.backend === "khadim") {
          if (runtimeSession?.backend_session_id) {
            backendSessionId = runtimeSession.backend_session_id;
            backendSessionCwd = runtimeSession.backend_session_cwd ?? executionCwd;
          } else {
            const session = await commands.khadimCreateSession(selectedWorkspace.id, executionCwd);
            backendSessionId = session.id;
            backendSessionCwd = session.cwd;
          }
        }

        if (runtimeSessionId && backendSessionId) {
          await commands.updateRuntimeSessionBackend(
            runtimeSessionId,
            backendSessionId,
            backendSessionCwd,
            issueUrl ? "running" : "idle",
          ).catch(() => undefined);
        }
      }

      if (backendSessionId) {
        await setConversationBackendSessionMutation.mutateAsync({
          workspaceId: selectedWorkspace.id,
          id: conversation.id,
          backendSessionId,
          backendSessionCwd,
          branch: executionBranch,
          worktreePath: executionWorktreePath,
        });
        updatedConversation = { ...conversation, backend_session_id: backendSessionId };
      }

      if (environmentId) {
        await setConversationEnvironmentMutation.mutateAsync({
          workspaceId: selectedWorkspace.id,
          id: conversation.id,
          environmentId,
          runtimeSessionId,
        }).catch(() => undefined);
      }

      setSelectedConversationId(updatedConversation.id);
      const modelLabel = selectedModelOption ? selectedModelOption.model_name : null;
      const newAgent = createAgentInstance(
        updatedConversation.id,
        selectedWorkspaceId!,
        label,
        updatedConversation.backend_session_id ?? null,
        modelLabel,
        executionBranch,
        executionWorktreePath,
        issueUrl,
        environmentId,
        runtimeSessionId,
      );
      setAgents((prev) => [...prev, { ...newAgent, status: issueUrl ? "running" : "idle", startedAt: issueUrl ? new Date().toISOString() : null }]);
      setFocusedAgentId(updatedConversation.id);

      // Send initial message with issue context if provided
      if (issueUrl && updatedConversation.backend_session_id) {
        const issuePrompt = `Please work on this GitHub issue:\n\n${issueUrl}\n\nRead the issue, understand what needs to be done, and implement a solution. Create a branch if needed, make the necessary changes, and ensure the code is working.`;
        const modelRef = selectedModelOption
          ? { provider_id: selectedModelOption.provider_id, model_id: selectedModelOption.model_id }
          : null;

        if (selectedWorkspace.backend === "khadim") {
          await commands.khadimSendStreaming(
            selectedWorkspace.id,
            updatedConversation.backend_session_id,
            updatedConversation.id,
            issuePrompt,
            modelRef,
          );
        } else if (selectedWorkspace.backend === "claude_code") {
          await commands.claudeCodeSendStreaming(
            selectedWorkspace.id,
            updatedConversation.backend_session_id,
            updatedConversation.id,
            issuePrompt,
            modelRef,
          );
        } else {
          await commands.opencodeSendStreaming(
            selectedWorkspace.id,
            updatedConversation.backend_session_id,
            updatedConversation.id,
            issuePrompt,
            modelRef,
          );
        }
      }

      if (!inWorkspace) {
        setInWorkspace(true);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsCreatingAgent(false);
    }
  }, [
    createConversationMutation,
    createEnvironmentMutation,
    createRuntimeSessionMutation,
    ensureOpenCodeStarted,
    getErrorMessage,
    inWorkspace,
    selectedModelOption,
    selectedWorkspace,
    setAgents,
    setError,
    setFocusedAgentId,
    setInWorkspace,
    setSelectedConversationId,
    setConversationBackendSessionMutation,
    setConversationEnvironmentMutation,
  ]);

  return {
    handleCreateWorkspace,
    handleDeleteWorkspace,
    handleWorkspaceBranchChange,
    handleStartOpenCode,
    handleStopOpenCode,
    handleNewConversation,
    handleSelectModel,
    handleRemoveAgent,
    handleCreateAgentWithWorktree,
    isCreatingWorkspace: createWorkspaceMutation.isPending,
    isCreatingAgent,
  };
}
