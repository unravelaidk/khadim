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
  useCreateWorkspaceMutation,
  useDeleteConversationMutation,
  useDeleteWorkspaceMutation,
  useSetConversationBackendSessionMutation,
  useSetSettingMutation,
  useSetWorkspaceBranchMutation,
  useStartOpenCodeMutation,
  useStopOpenCodeMutation,
} from "../lib/queries";
import { getModelSettingKey } from "../lib/model-selection";
import type { AgentInstance, WorkHomeView } from "../lib/types";
import { createAgentInstance } from "../lib/types";
import { extractSessionId } from "../lib/ui";

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
        });
        updatedConversation = { ...conversation, backend_session_id: sessionId };
      } else if (selectedWorkspace.backend === "khadim") {
        const session = await commands.khadimCreateSession(selectedWorkspace.id);
        await setConversationBackendSessionMutation.mutateAsync({
          workspaceId: selectedWorkspace.id,
          id: conversation.id,
          backendSessionId: session.id,
        });
        updatedConversation = { ...conversation, backend_session_id: session.id };
      }

      setSelectedConversationId(updatedConversation.id);
      const modelLabel = selectedModelOption ? selectedModelOption.model_name : null;
      const newAgent = createAgentInstance(
        updatedConversation.id,
        `Agent ${agents.length + 1}`,
        updatedConversation.backend_session_id ?? null,
        modelLabel,
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

    if (agent.status === "running" && agent.sessionId && selectedWorkspace) {
      if (selectedWorkspace.backend === "khadim") {
        await commands.khadimAbort(agent.sessionId).catch(() => {});
      } else {
        await commands.opencodeAbort(selectedWorkspace.id, agent.sessionId).catch(() => {});
      }
    }

    if (selectedWorkspace) {
      await deleteConversationMutation.mutateAsync({ workspaceId: selectedWorkspace.id, id: agentId }).catch(() => {});
    }

    if (deleteWorktree && agent.worktreePath && selectedWorkspace) {
      await commands.gitRemoveWorktree(selectedWorkspace.repo_path, agent.worktreePath, false).catch(() => {});
    }

    const nextAgents = agents.filter((candidate) => candidate.id !== agentId);
    setAgents(nextAgents);

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
    setFocusedAgentId,
    setSelectedConversationId,
  ]);

  const handleCreateAgentWithWorktree = useCallback(async (branch: string, worktreePath: string, label: string) => {
    if (!selectedWorkspace) return;
    setIsCreatingAgent(true);
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
        });
        updatedConversation = { ...conversation, backend_session_id: sessionId };
      } else if (selectedWorkspace.backend === "khadim") {
        const session = await commands.khadimCreateSession(selectedWorkspace.id, worktreePath);
        await setConversationBackendSessionMutation.mutateAsync({
          workspaceId: selectedWorkspace.id,
          id: conversation.id,
          backendSessionId: session.id,
        });
        updatedConversation = { ...conversation, backend_session_id: session.id };
      }

      setSelectedConversationId(updatedConversation.id);
      const modelLabel = selectedModelOption ? selectedModelOption.model_name : null;
      const newAgent = createAgentInstance(
        updatedConversation.id,
        label,
        updatedConversation.backend_session_id ?? null,
        modelLabel,
        branch,
        worktreePath,
      );
      setAgents((prev) => [...prev, newAgent]);
      setFocusedAgentId(updatedConversation.id);

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
