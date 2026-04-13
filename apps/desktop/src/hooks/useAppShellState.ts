import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PendingQuestion } from "../lib/bindings";
import type { AgentInstance, InteractionMode, WorkView } from "../lib/types";

interface UseAppShellStateArgs {
  setFocusedAgentId: Dispatch<SetStateAction<string | null>>;
  setSelectedConversationId: Dispatch<SetStateAction<string | null>>;
  setSelectedWorkspaceId: Dispatch<SetStateAction<string | null>>;
  setPendingQuestion: Dispatch<SetStateAction<PendingQuestion | null>>;
  setAgents: Dispatch<SetStateAction<AgentInstance[]>>;
}

export function useAppShellState({
  setFocusedAgentId,
  setSelectedConversationId,
  setSelectedWorkspaceId,
  setPendingQuestion,
  setAgents,
}: UseAppShellStateArgs) {
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("chat");
  const [workView, setWorkView] = useState<WorkView>("dashboard");
  const [inWorkspace, setInWorkspace] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNewAgentModal, setShowNewAgentModal] = useState(false);
  const [agentSettingsTarget, setAgentSettingsTarget] = useState<string | null>(null);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const handleEnterWorkspace = useCallback((id: string) => {
    setSelectedWorkspaceId(id);
    setInWorkspace(true);
    setShowSettings(false);
  }, [setSelectedWorkspaceId]);

  const handleExitWorkspace = useCallback(() => {
    setInWorkspace(false);
    setWorkView("dashboard");
  }, []);

  const handleFocusAgent = useCallback((agentId: string) => {
    setFocusedAgentId(agentId);
    setSelectedConversationId(agentId);
    setShowSettings(false);
  }, [setFocusedAgentId, setSelectedConversationId]);

  const handleFocusAgentFromHome = useCallback((workspaceId: string, agentId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setInWorkspace(true);
    setFocusedAgentId(agentId);
    setSelectedConversationId(agentId);
    setShowSettings(false);
  }, [setSelectedWorkspaceId, setFocusedAgentId, setSelectedConversationId]);

  const handleOpenCreateWorkspace = useCallback(() => {
    setShowCreateModal(true);
    setShowSettings(false);
  }, []);

  const handleOpenNewAgent = useCallback(() => {
    setShowNewAgentModal(true);
    setShowSettings(false);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleSelectWorkspaceConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
    setFocusedAgentId(id);
  }, [setFocusedAgentId, setSelectedConversationId]);

  const handleOpenSettingsFromWorkspace = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleRenameAgent = useCallback((agentId: string, newLabel: string) => {
    setAgents((prev) => prev.map((agent) => agent.id === agentId ? { ...agent, label: newLabel } : agent));
  }, [setAgents]);

  const handleQuestionDismiss = useCallback(() => {
    setPendingQuestion(null);
  }, [setPendingQuestion]);

  const handleManageWorkspace = useCallback(() => {
    setFocusedAgentId(null);
    setSelectedConversationId(null);
  }, [setFocusedAgentId, setSelectedConversationId]);

  const handleManageAgent = useCallback((agentId: string) => {
    setAgentSettingsTarget(agentId);
  }, []);

  const handleSwitchMode = useCallback((mode: InteractionMode) => {
    setInteractionMode(mode);
    setShowSettings(false);
  }, []);

  const handleNavigateWork = useCallback((view: WorkView) => {
    setWorkView(view);
    setShowSettings(false);
  }, []);

  /** @deprecated — kept for compatibility */
  const sidebarWorkView: WorkView = workView;

  return {
    interactionMode,
    workView,
    inWorkspace,
    showSettings,
    showCreateModal,
    showNewAgentModal,
    agentSettingsTarget,
    setInWorkspace,
    setWorkView,
    setShowCreateModal,
    setShowNewAgentModal,
    setAgentSettingsTarget,
    handleCloseSettings,
    handleEnterWorkspace,
    handleExitWorkspace,
    handleFocusAgent,
    handleFocusAgentFromHome,
    handleOpenCreateWorkspace,
    handleOpenNewAgent,
    handleOpenSettings,
    handleSelectWorkspaceConversation,
    handleOpenSettingsFromWorkspace,
    handleRenameAgent,
    handleQuestionDismiss,
    handleManageWorkspace,
    handleManageAgent,
    handleSwitchMode,
    handleNavigateWork,
    sidebarWorkView,
  };
}
