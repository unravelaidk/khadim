import { useEffect, useEffectEvent, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AgentStreamEvent,
  ChatMessage as StoredMessage,
  Conversation,
  OpenCodeStarted,
  OpenCodeModelOption,
  OpenCodeModelRef,
  PendingApproval,
  PendingQuestion,
  ProcessOutput,
  RepoSlug,
  ThinkingStepData,
  Workspace,
} from "./lib/bindings";
import { commands, events } from "./lib/bindings";
import {
  desktopQueryKeys,
  useConversationsQuery,
  useGitDiffStatQuery,
  useGitHubAuthStatusQuery,
  useGitHubSlugQuery,
  useGitStatusQuery,
  useKhadimActiveModelQuery,
  useMessagesQuery,
  useRuntimeSummaryQuery,
  useSetSettingMutation,
  useSettingQuery,
  useWorkspaceConnectionQuery,
  useWorkspaceModelsQuery,
  useWorkspaceQuery,
  useWorkspacesQuery,
} from "./lib/queries";
import { useAppShellState } from "./hooks/useAppShellState";
import { useThemePreferences } from "./hooks/useThemePreferences";
import { useAgentChatActions } from "./hooks/useAgentChatActions";
import { useAgentStreamHandler } from "./hooks/useAgentStreamHandler";
import { useWorkspaceActions } from "./hooks/useWorkspaceActions";
import { applyStreamingStepEvent, deriveCurrentActivity, extractStreamPreview, finalizeSteps, formatStreamingError, getErrorMessage, hasFinishedAfter } from "./lib/streaming";
import { initWebviewZoom } from "./lib/webview-zoom";
import { findSelectedModelOption, getModelKey, getModelSettingKey, parseStoredModel, resolvePreferredModel, selectModelByKey } from "./lib/model-selection";
import type { AgentInstance, InteractionMode, WorkHomeView } from "./lib/types";
import { createAgentInstance, createLocalConversation } from "./lib/types";
import { useStandaloneChat } from "./hooks/useStandaloneChat";
import { useAgentPersistence } from "./hooks/useAgentPersistence";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceView } from "./components/WorkspaceView";
import { WorkspaceList } from "./components/WorkspaceList";
import { ActivityChart } from "./components/ActivityChart";
import { ChatView } from "./components/chat/ChatView";
import { CreateWorkspaceModal } from "./components/CreateWorkspaceModal";
import { NewAgentModal } from "./components/NewAgentModal";
import { AgentSettingsModal } from "./components/AgentSettingsModal";
import { QuestionOverlay } from "./components/QuestionOverlay";
import { ApprovalOverlay } from "./components/ApprovalOverlay";
import { SettingsPanel } from "./components/SettingsPanel";

initWebviewZoom();

const STANDALONE_KHADIM_WORKSPACE_ID = "__chat__";

/* ─── App ──────────────────────────────────────────────────────────── */

export default function App() {
  const queryClient = useQueryClient();
  const {
    themeFamily,
    themeMode,
    catppuccinVariant,
    themeVariant,
    handleSetThemeFamily,
    handleSetThemeMode,
    handleSetCatppuccinVariant,
    handleToggleTheme,
  } = useThemePreferences();

  // ── Workspace state ─────────────────────────────────────────────
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  // ── Conversation & messages ─────────────────────────────────────
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  // ── Connection & process ────────────────────────────────────────
  const [processOutput, setProcessOutput] = useState<ProcessOutput[]>([]);
  const [selectedModelOverride, setSelectedModelOverride] = useState<OpenCodeModelRef | null>(null);

  // ── Agent instances (multi-agent) ───────────────────────────────
  const [agents, setAgents] = useState<AgentInstance[]>([]);
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);

  // Persist agent state across app restarts
  useAgentPersistence(agents, setAgents);

  // ── GitHub ──────────────────────────────────────────────────────
  // ── Chat / streaming (for the focused agent) ────────────────────
  const [agentChatInput, setAgentChatInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingSteps, setStreamingSteps] = useState<ThinkingStepData[]>([]);
  /** Snapshots of streaming steps keyed by conversation ID, preserved across the streaming→history transition. */
  const completedStepsRef = useRef<Map<string, ThinkingStepData[]>>(new Map());
  /** Sessions that already errored so trailing done events do not overwrite the UI state. */
  const erroredAgentSessionsRef = useRef<Set<string>>(new Set());
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const {
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
    handleOpenCreateWorkspace,
    handleOpenNewAgent,
    handleOpenSettings,
    handleSelectWorkspaceConversation,
    handleFocusAgentFromHome,
    handleOpenSettingsFromWorkspace,
    handleRenameAgent,
    handleManageWorkspace,
    handleManageAgent,
    handleSwitchMode,
    handleNavigateWork,
    sidebarWorkView,
  } = useAppShellState({
    setFocusedAgentId,
    setSelectedConversationId,
    setSelectedWorkspaceId,
    setPendingQuestion,
    setAgents,
  });
  const { data: runtime = null } = useRuntimeSummaryQuery();
  const { data: githubAuthStatus = null } = useGitHubAuthStatusQuery();
  const { data: workspaces = [] } = useWorkspacesQuery();
  const { data: selectedWorkspace = null } = useWorkspaceQuery(selectedWorkspaceId, Boolean(selectedWorkspaceId));
  const { data: conversations = [] } = useConversationsQuery(selectedWorkspaceId, Boolean(selectedWorkspaceId));
  const { data: queriedMessages = [] } = useMessagesQuery(selectedConversationId, Boolean(selectedConversationId));
  const { data: storedWorkspaceModel = null } = useSettingQuery(
    selectedWorkspaceId ? getModelSettingKey(selectedWorkspaceId) : null,
    Boolean(selectedWorkspaceId),
  );
  const { data: khadimActiveModel = null } = useKhadimActiveModelQuery(selectedWorkspace?.backend === "khadim");
  const { data: connection = null } = useWorkspaceConnectionQuery(
    selectedWorkspaceId,
    selectedWorkspace?.backend ?? null,
    Boolean(selectedWorkspaceId),
  );
  const repoPath = selectedWorkspace ? (selectedWorkspace.worktree_path ?? selectedWorkspace.repo_path) : null;
  const { data: gitStatus = "" } = useGitStatusQuery(repoPath, Boolean(repoPath));
  const { data: gitDiffStat = "" } = useGitDiffStatQuery(repoPath, Boolean(repoPath));
  const { data: availableModels = [] } = useWorkspaceModelsQuery(
    selectedWorkspaceId,
    selectedWorkspace?.backend ?? null,
    Boolean(connection),
    Boolean(selectedWorkspaceId),
  );
  const { data: githubSlug = null } = useGitHubSlugQuery(repoPath, Boolean(repoPath));
  const { data: storedChatDirectory = null } = useSettingQuery("khadim:chat_directory");
  const setSettingMutation = useSetSettingMutation();
  // ── Derived state ───────────────────────────────────────────────
  const storedSelectedModel = useMemo(() => parseStoredModel(storedWorkspaceModel), [storedWorkspaceModel]);
  const selectedModel = useMemo(() => {
    if (selectedModelOverride && availableModels.some((model) => getModelKey(model) === getModelKey(selectedModelOverride))) {
      return selectedModelOverride;
    }
    const fallback = storedSelectedModel
      ?? (khadimActiveModel
        ? { provider_id: khadimActiveModel.provider_id, model_id: khadimActiveModel.model_id }
        : null);
    return resolvePreferredModel(availableModels, fallback);
  }, [availableModels, khadimActiveModel, selectedModelOverride, storedSelectedModel]);
  const activeConversation = conversations.find((item) => item.id === selectedConversationId) ?? null;
  const focusedAgent = agents.find((a) => a.id === focusedAgentId) ?? null;
  const focusedAgentIsProcessing = focusedAgent?.status === "running";
  const focusedAgentStreamingContent = focusedAgent?.streamingContent ?? "";
  const focusedAgentStreamingSteps = focusedAgent?.streamingSteps ?? [];
  const {
    chatConversations,
    setChatConversations,
    activeChatId,
    activeChatConv,
    standaloneChatInput,
    setStandaloneChatInput,
    chatIsProcessing,
    setChatIsProcessing,
    chatStreamingContent,
    setChatStreamingContent,
    chatStreamingSteps,
    setChatStreamingSteps,
    chatAvailableModels,
    chatSelectedModel,
    chatDirectory,
    setChatDirectory,
    handleSelectChat,
    handleNewStandaloneChat,
    handleDeleteStandaloneChat,
    handleStandaloneChatSend,
    handleStandaloneChatAbort,
    handleChatSelectModel,
    handleChatDirectoryChange,
    activeStandaloneIsProcessing,
    activeStandaloneStreamingContent,
    activeStandaloneStreamingSteps,
    chatSessionIdRef,
    chatActiveConvIdRef,
    chatConversationsRef,
    chatStreamingContentRef,
    chatStreamingStepsRef,
    chatErroredSessionsRef,
  } = useStandaloneChat({
    standaloneWorkspaceId: STANDALONE_KHADIM_WORKSPACE_ID,
    getErrorMessage,
    finalizeSteps,
    setGlobalError: setError,
    onCloseSettings: handleCloseSettings,
  });

  const handleNewAgentForWorkspace = useCallback((workspaceId: string) => {
    handleEnterWorkspace(workspaceId);
    setShowNewAgentModal(true);
  }, [handleEnterWorkspace, setShowNewAgentModal]);

  useEffect(() => {
    if (!focusedAgent || focusedAgent.status !== "running") return;
    const lastMessage = queriedMessages[queriedMessages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") return;
    if (!hasFinishedAfter(focusedAgent.startedAt, lastMessage.created_at)) return;
    if (focusedAgent.streamingContent.trim()) return;
    if (focusedAgent.streamingSteps.some((step) => step.status === "running")) return;

    setIsProcessing(false);
    setStreamingContent("");
    setStreamingSteps([]);
    setAgents((prev) => prev.map((agent) => {
      if (agent.id !== focusedAgent.id || agent.status !== "running") return agent;
      return {
        ...agent,
        status: "complete",
        streamingContent: "",
        streamPreview: [],
        streamingSteps: [],
        currentActivity: null,
        finishedAt: lastMessage.created_at,
      };
    }));
  }, [focusedAgent, queriedMessages]);

  const selectedModelOption = findSelectedModelOption(availableModels, selectedModel);
  const messages = useMemo(() => {
    if (!selectedConversationId) return [] as StoredMessage[];
    const nextMessages = queriedMessages.map((message) => ({ ...message }));
    const savedSteps = completedStepsRef.current.get(selectedConversationId);
    if (savedSteps && savedSteps.length > 0) {
      for (let i = nextMessages.length - 1; i >= 0; i -= 1) {
        if (nextMessages[i].role === "assistant") {
          (nextMessages[i] as StoredMessage & { thinkingSteps?: ThinkingStepData[] }).thinkingSteps = savedSteps;
          break;
        }
      }
    }
    return nextMessages;
  }, [queriedMessages, selectedConversationId]);

  const {
    handleCreateWorkspace,
    handleDeleteWorkspace,
    handleWorkspaceBranchChange,
    handleStartOpenCode,
    handleStopOpenCode,
    handleNewConversation,
    handleSelectModel,
    handleRemoveAgent,
    handleCreateAgentWithWorktree,
    isCreatingWorkspace,
    isCreatingAgent,
  } = useWorkspaceActions({
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
  });
  const {
    handleChatSend,
    handleAbort,
    handleQuestionAnswer,
    handleQuestionDismiss,
    handleApprovalDecision,
  } = useAgentChatActions({
    queryClient,
    selectedWorkspace,
    activeConversation,
    focusedAgentId,
    selectedModel,
    agentChatInput,
    availableModels,
    setSetting: (key, value) => setSettingMutation.mutateAsync({ key, value }),
    setSelectedModelOverride,
    setAgentChatInput,
    setIsProcessing,
    setStreamingContent,
    setStreamingSteps,
    completedStepsRef,
    setError,
    pendingQuestion,
    setPendingQuestion,
    pendingApproval,
    setPendingApproval,
    setAgents,
    erroredAgentSessionsRef,
    handleNewConversation,
    getErrorMessage,
  });
  const handleAgentStreamEvent = useAgentStreamHandler({
    queryClient,
    selectedWorkspaceId,
    selectedWorkspaceBackend: selectedWorkspace?.backend ?? null,
    selectedConversationId,
    activeConversationBackendSessionId: activeConversation?.backend_session_id ?? null,
    activeConversationId: activeConversation?.id ?? null,
    agents,
    setPendingQuestion,
    setPendingApproval,
    setError,
    setIsProcessing,
    setStreamingContent,
    setStreamingSteps,
    setAgents,
    completedStepsRef,
    erroredAgentSessionsRef,
    chatConversationsRef,
    chatActiveConvIdRef,
    chatStreamingContentRef,
    chatStreamingStepsRef,
    chatErroredSessionsRef,
    setChatConversations,
    setChatStreamingContent,
    setChatStreamingSteps,
    setChatIsProcessing,
    standaloneWorkspaceId: STANDALONE_KHADIM_WORKSPACE_ID,
    finalizeSteps,
    applyStreamingStepEvent,
    extractStreamPreview,
    deriveCurrentActivity,
    formatStreamingError,
  });

  // ── Data loaders ────────────────────────────────────────────────

  async function loadWorkspaceState(workspace: Workspace) {
    setLoadingWorkspace(true);
    try {
      const nextConversations = await commands.listConversations(workspace.id);

      // Auto-start the agent backend if not already running
      if (!connection && workspace.backend === "opencode") {
        handleStartOpenCode()
          .catch((err) => console.warn("[auto-start] OpenCode start failed:", err));
      }

      // Update agents for this workspace in the global list
      setAgents((prev) => {
        const otherWorkspaceAgents = prev.filter((a) => a.workspaceId !== workspace.id);
        const workspaceAgents = nextConversations.map((conv, i) => {
          const instance = createAgentInstance(
            conv.id,
            workspace.id,
            conv.title ?? `Agent ${i + 1}`,
            conv.backend_session_id ?? null,
            null,
            conv.branch ?? null,
            conv.worktree_path ?? null,
          );
          if (conv.input_tokens > 0 || conv.output_tokens > 0) {
            instance.tokenUsage = {
              inputTokens: conv.input_tokens,
              outputTokens: conv.output_tokens,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            };
          }
          return instance;
        });
        return [...otherWorkspaceAgents, ...workspaceAgents];
      });

      const preferredConversation = nextConversations.find((item) => item.is_active) ?? nextConversations[0] ?? null;
      const preferredId = preferredConversation?.id ?? null;
      setSelectedConversationId(preferredId);
      setFocusedAgentId(preferredId);
    } finally {
      setLoadingWorkspace(false);
    }
  }

  // ── Init ────────────────────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      try {
      } catch (error) {
        setError(getErrorMessage(error));
      }
    })();
  }, []);

  // Load agents for all workspaces on startup
  useEffect(() => {
    if (workspaces.length === 0) return;
    
    void (async () => {
      const allAgents: AgentInstance[] = [];
      
      for (const workspace of workspaces) {
        try {
          const conversations = await commands.listConversations(workspace.id);
          for (const conv of conversations) {
            const instance = createAgentInstance(
              conv.id,
              workspace.id,
              conv.title ?? `Agent`,
              conv.backend_session_id ?? null,
              null,
              conv.branch ?? null,
              conv.worktree_path ?? null,
            );
            if (conv.input_tokens > 0 || conv.output_tokens > 0) {
              instance.tokenUsage = {
                inputTokens: conv.input_tokens,
                outputTokens: conv.output_tokens,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              };
            }
            allAgents.push(instance);
          }
        } catch {
          // Skip workspaces that fail to load
        }
      }
      
      setAgents(allAgents);
    })();
  }, [workspaces]);

  useEffect(() => {
    setChatDirectory(storedChatDirectory ?? null);
  }, [setChatDirectory, storedChatDirectory]);

  // Load workspace state when entering a workspace
  useEffect(() => {
    if (!selectedWorkspaceId || !selectedWorkspace) {
      setSelectedModelOverride(null);
      setFocusedAgentId(null);
      return;
    }
    void loadWorkspaceState(selectedWorkspace).catch((error) => {
      setError(getErrorMessage(error));
    });
  }, [connection, selectedWorkspaceId, selectedWorkspace]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    if (!selectedModel) return;
    const modelKey = getModelKey(selectedModel);
    if (storedSelectedModel && getModelKey(storedSelectedModel) === modelKey) return;
    void setSettingMutation.mutateAsync({
      key: getModelSettingKey(selectedWorkspaceId),
      value: JSON.stringify(selectedModel),
    })
      .catch(() => undefined);
  }, [selectedModel, selectedWorkspaceId, setSettingMutation, storedSelectedModel]);

  useEffect(() => {
    if (!selectedModel) return;
    const option = availableModels.find((model) => getModelKey(model) === getModelKey(selectedModel));
    if (!option) return;
    setAgents((prev) => prev.map((agent) => ({ ...agent, modelLabel: agent.modelLabel ?? option.model_name })));
  }, [availableModels, selectedModel]);

  // ── Scroll tracking ─────────────────────────────────────────────

  useEffect(() => {
    const el = chatEndRef.current;
    if (!el) return;
    const scrollParent = el.closest("main");
    if (!scrollParent) return;

    const handleScroll = () => {
      const threshold = 120;
      const { scrollTop, scrollHeight, clientHeight } = scrollParent;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < threshold;
    };

    scrollParent.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollParent.removeEventListener("scroll", handleScroll);
  }, [messages, focusedAgentIsProcessing]);

  const scrollToBottom = () => {
    const el = chatEndRef.current;
    if (!el) return;
    const scrollParent = el.closest("main");
    if (scrollParent) {
      scrollParent.scrollTop = scrollParent.scrollHeight;
    }
  };

  useEffect(() => {
    if ((messages.length > 0 || focusedAgentIsProcessing || activeStandaloneIsProcessing) && isNearBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, focusedAgentIsProcessing, focusedAgentStreamingContent, focusedAgentStreamingSteps, activeStandaloneIsProcessing, activeStandaloneStreamingContent, activeStandaloneStreamingSteps, activeChatConv?.messages]);

  const handleProcessOutputEvent = useEffectEvent((output: ProcessOutput) => {
    setProcessOutput((prev) => [...prev.slice(-499), output]);
  });

  const handleOpencodeReadyEvent = useEffectEvent((info: OpenCodeStarted) => {
    if (info.workspace_id === selectedWorkspaceId) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: desktopQueryKeys.workspaceConnection(info.workspace_id) }),
        queryClient.invalidateQueries({ queryKey: ["workspace-models", info.workspace_id] }),
      ]).catch(() => undefined);
    }
  });

  // ── Event listeners ─────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    let unlistenOutput: (() => void) | undefined;
    let unlistenReady: (() => void) | undefined;
    let unlistenStream: (() => void) | undefined;

    void events.onProcessOutput((output) => {
      if (!alive) return;
      handleProcessOutputEvent(output);
    }).then((fn) => { unlistenOutput = fn; });

    void events.onOpencodeReady((info) => {
      if (!alive) return;
      handleOpencodeReadyEvent(info);
    }).then((fn) => { unlistenReady = fn; });

    void events.onAgentStream((evt: AgentStreamEvent) => {
      if (!alive) return;
      handleAgentStreamEvent(evt);
    }).then((fn) => { unlistenStream = fn; });

    return () => {
      alive = false;
      unlistenOutput?.();
      unlistenReady?.();
      unlistenStream?.();
    };
  }, []);

  const activeProcessOutput = connection
    ? processOutput.filter((line) => line.process_id === connection.process_id)
    : [];

  // ── Actions ─────────────────────────────────────────────────────

  const handleOpenFileInEditor = useCallback((path: string) => {
    commands.openInEditor(path).catch((err) => {
      console.warn("Failed to open file:", err);
    });
  }, []);

  // ── Main render ─────────────────────────────────────────────────

  return (
    <div className="glass-page-shell flex h-full max-h-full overflow-hidden" data-theme-family={themeFamily} data-theme-variant={themeVariant}>
      <Sidebar
        mode={interactionMode}
        onSwitchMode={handleSwitchMode}
        // Chat mode props
        chatConversations={chatConversations}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewStandaloneChat}
        onDeleteChat={handleDeleteStandaloneChat}
        // Work mode — home props
        workView={sidebarWorkView}
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelectWorkspace={handleEnterWorkspace}
        onNavigateWork={handleNavigateWork}
        onNewWorkspace={handleOpenCreateWorkspace}
        onNewAgentForWorkspace={handleNewAgentForWorkspace}
        onFocusAgentFromHome={handleFocusAgentFromHome}
        agents={agents}
        // Work mode — workspace props
        activeWorkspace={selectedWorkspace}
        onExitWorkspace={handleExitWorkspace}
        focusedAgentId={focusedAgentId}
        onFocusAgent={handleFocusAgent}
        onNewAgent={handleOpenNewAgent}
        onRemoveAgent={handleRemoveAgent}
        onManageWorkspace={handleManageWorkspace}
        onManageAgent={handleManageAgent}
        activeWorkspaceConnected={Boolean(connection)}
        githubAuthenticated={githubAuthStatus?.authenticated ?? false}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={handleOpenSettings}
        showSettings={showSettings}
      />

      <div className="relative z-10 flex flex-col overflow-hidden" style={{ flex: "1 1 0%", minWidth: 0, minHeight: 0 }}>
        {/* Error banner */}
        {error && (
          <div className="shrink-0 px-6 pt-4">
            <div className="rounded-2xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg-strong)] px-4 py-3 text-[12px] text-[var(--color-danger-text)] flex items-center justify-between gap-3">
              <span>{error}</span>
              <button className="font-semibold" onClick={() => setError(null)}>Dismiss</button>
            </div>
          </div>
        )}

        {/* ── SETTINGS (shown from any mode) ─────────────────────── */}
        {showSettings && (
          <SettingsPanel
            onClose={handleCloseSettings}
            runtime={runtime}
            githubAuthStatus={githubAuthStatus}
            onGitHubAuthChange={() => {
              void queryClient.invalidateQueries({ queryKey: desktopQueryKeys.githubAuthStatus }).catch(() => undefined);
            }}
            themeFamily={themeFamily}
            themeMode={themeMode}
            catppuccinVariant={catppuccinVariant}
            onSetThemeFamily={handleSetThemeFamily}
            onSetThemeMode={handleSetThemeMode}
            onSetCatppuccinVariant={handleSetCatppuccinVariant}
            chatDirectory={chatDirectory}
            onChatDirectoryChange={(dir) => void handleChatDirectoryChange(dir)}
          />
        )}

        {/* ── CHAT MODE ─────────────────────────────────────────── */}
        {!showSettings && interactionMode === "chat" && (
          <ChatView
            localConversation={activeChatConv}
            conversationId={activeChatId}
            title={activeChatConv?.title ?? "Chat"}
            subtitle={
              chatDirectory
                ? chatDirectory
                : activeChatConv
                  ? `${activeChatConv.messages.length} messages`
                  : "Start a new conversation"
            }
            basePath={chatDirectory}
            input={standaloneChatInput}
            onInputChange={setStandaloneChatInput}
            onSend={handleStandaloneChatSend}
            onStop={() => void handleStandaloneChatAbort()}
            onNewChat={handleNewStandaloneChat}
            isProcessing={activeStandaloneIsProcessing}
            streamingContent={activeStandaloneStreamingContent}
            streamingSteps={activeStandaloneStreamingSteps}
            availableModels={chatAvailableModels}
            selectedModel={chatSelectedModel}
            onSelectModel={(key) => void handleChatSelectModel(key)}
            chatEndRef={chatEndRef}
          />
        )}

        {/* ── WORK MODE — home views ────────────────────────────── */}
        {!showSettings && interactionMode === "work" && !inWorkspace && workView === "workspaces" && (
          <div className="flex-1 flex flex-col overflow-y-auto scrollbar-thin" style={{ minHeight: 0 }}>
            <div className="mx-auto w-full max-w-5xl px-6 pt-5 pb-2">
              <ActivityChart agents={agents} />
            </div>
            <WorkspaceList
              workspaces={workspaces}
              onSelect={handleEnterWorkspace}
              onCreateNew={handleOpenCreateWorkspace}
              onDelete={(id) => void handleDeleteWorkspace(id)}
            />
          </div>
        )}

        {/* ── WORK MODE — inside a workspace ────────────────────── */}
        {!showSettings && interactionMode === "work" && inWorkspace && !focusedAgentId && selectedWorkspace && (
          <WorkspaceView
            workspace={selectedWorkspace}
            conversations={conversations}
            connection={connection}
            processOutput={activeProcessOutput}
            gitStatus={gitStatus}
            gitDiffStat={gitDiffStat}
            agents={agents}
            onSelectConversation={handleSelectWorkspaceConversation}
            onStartOpenCode={() => void handleStartOpenCode()}
            onStopOpenCode={() => void handleStopOpenCode()}
            onNewAgent={handleOpenNewAgent}
            onFocusAgent={handleFocusAgent}
            onManageAgent={handleManageAgent}
            onWorkspaceBranchChange={handleWorkspaceBranchChange}
            loading={loadingWorkspace || focusedAgentIsProcessing}
            githubAuthStatus={githubAuthStatus}
            githubSlug={githubSlug}
            onNavigateToSettings={handleOpenSettingsFromWorkspace}
            onGitHubSlugChange={() => {
              if (!repoPath) return;
              void queryClient.invalidateQueries({ queryKey: desktopQueryKeys.githubSlug(repoPath) }).catch(() => undefined);
            }}
          />
        )}

        {!showSettings && interactionMode === "work" && inWorkspace && focusedAgentId && (
          <ChatView
            messages={messages}
            conversationId={selectedConversationId}
            title={focusedAgent?.label ?? activeConversation?.title ?? "Chat"}
            subtitle={focusedAgent?.currentActivity ?? (activeConversation ? (activeConversation.title ?? "Active conversation") : "No conversation")}
            basePath={selectedWorkspace ? (selectedWorkspace.worktree_path ?? selectedWorkspace.repo_path) : null}
            agent={focusedAgent}
            showModifiedFiles
            onOpenFile={handleOpenFileInEditor}
            input={agentChatInput}
            onInputChange={setAgentChatInput}
            onSend={() => void handleChatSend()}
            onStop={() => void handleAbort()}
            onNewChat={() => void handleNewConversation()}
            isProcessing={focusedAgentIsProcessing}
            streamingContent={focusedAgentStreamingContent}
            streamingSteps={focusedAgentStreamingSteps}
            availableModels={availableModels}
            selectedModel={selectedModel}
            onSelectModel={(key) => void handleSelectModel(key)}
            chatEndRef={chatEndRef}
            backend={selectedWorkspace?.backend ?? "khadim"}
          />
        )}
      </div>

      {/* Create workspace modal */}
      <CreateWorkspaceModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateWorkspace}
        isCreating={isCreatingWorkspace}
      />

      {/* New agent modal */}
      {selectedWorkspace && (
        <NewAgentModal
          isOpen={showNewAgentModal}
          workspace={selectedWorkspace}
          onClose={() => setShowNewAgentModal(false)}
          onCreateAgent={(branch, worktreePath, label, issueUrl) => void handleCreateAgentWithWorktree(branch, worktreePath, label, issueUrl)}
          isCreating={isCreatingAgent}
        />
      )}

      {/* Agent settings modal */}
      {agentSettingsTarget && (() => {
        const target = agents.find((a) => a.id === agentSettingsTarget);
        if (!target) return null;
        return (
          <AgentSettingsModal
            isOpen
            agent={target}
            onClose={() => setAgentSettingsTarget(null)}
            onRename={handleRenameAgent}
            onDelete={(id, deleteWorktree) => void handleRemoveAgent(id, deleteWorktree)}
          />
        );
      })()}

      {/* Question overlay — shown when the agent asks a question */}
      {pendingQuestion && createPortal(
        <QuestionOverlay
          question={pendingQuestion}
          onAnswer={(answers) => void handleQuestionAnswer(answers)}
          onDismiss={() => {
            void handleQuestionDismiss();
          }}
        />,
        document.body,
      )}

      {/* Approval overlay — shown when Claude Code needs permission */}
      {pendingApproval && createPortal(
        <ApprovalOverlay
          approval={pendingApproval}
          onApprove={(remember) => {
            void handleApprovalDecision(true, remember);
          }}
          onDeny={() => {
            void handleApprovalDecision(false, false);
          }}
        />,
        document.body,
      )}
    </div>
  );
}
