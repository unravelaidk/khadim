import React, { useEffect, useEffectEvent, useRef, useState, useCallback, useMemo } from "react";
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
  useWorkspaceContextQuery,
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
import type { AgentInstance, InteractionMode, WorkView } from "./lib/types";
import { createAgentInstance, createLocalConversation } from "./lib/types";
import { useStandaloneChat } from "./hooks/useStandaloneChat";
import { useAgentPersistence } from "./hooks/useAgentPersistence";
import { usePluginTabs } from "./hooks/usePluginTabs";
import { useBuilderChatCount } from "./hooks/useBuilderChats";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceView } from "./components/WorkspaceView";
import { WorkspaceList } from "./components/WorkspaceList";
import { ChatView } from "./components/chat/ChatView";
import { ChatHomeView } from "./components/chat/ChatHomeView";
import { MemoryView } from "./components/chat/MemoryView";
import { CustomAgentsView } from "./components/chat/CustomAgentsView";
import { CreateWorkspaceModal } from "./components/CreateWorkspaceModal";
import { NewAgentModal } from "./components/NewAgentModal";
import { AgentSettingsModal } from "./components/AgentSettingsModal";
import { QuestionOverlay } from "./components/QuestionOverlay";
import { ApprovalOverlay } from "./components/ApprovalOverlay";
import { SettingsPanel } from "./components/SettingsPanel";
import { WorkspaceContextRail } from "./components/WorkspaceContextRail";
import { WorkArea } from "./components/WorkArea";
import { TerminalDock } from "./components/TerminalDock";
import { useManagedAgentsQuery, useAgentRunsQuery, useEnvironmentsQuery } from "./lib/queries";
import { FileFinder } from "./components/FileFinder";
import { GitChangesPanel } from "./components/GitChangesPanel";

initWebviewZoom();

const STANDALONE_KHADIM_WORKSPACE_ID = "__chat__";

/** Stable style objects to avoid creating new references on each render. */
const FLEX_FILL_STYLE = { flex: "1 1 0%", minWidth: 0, minHeight: 0 } as const;
const MIN_HEIGHT_ZERO_STYLE = { minHeight: 0 } as const;
const GIT_CHANGES_STYLE = { width: 280 } as const;

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

  // ── Sync theme to document root so body/html pick up variant colors ──
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme-family", themeFamily);
    html.setAttribute("data-theme-variant", themeVariant);
    html.style.colorScheme = themeVariant === "light" || themeVariant === "latte" ? "light" : "dark";
  }, [themeFamily, themeVariant]);

  useEffect(() => {
    let cancelled = false;

    void commands.khadimSyncSavedProviderModels()
      .then((result) => {
        if (cancelled) return;
        if (result.checked_providers === 0 && result.synced_providers === 0) return;

        void Promise.all([
          queryClient.invalidateQueries({ queryKey: desktopQueryKeys.providerStatuses }),
          queryClient.invalidateQueries({ queryKey: desktopQueryKeys.khadimActiveModel }),
          queryClient.invalidateQueries({ queryKey: ["agent-editor-models"] }),
          queryClient.invalidateQueries({ queryKey: ["workspace-models"] }),
        ]);
      })
      .catch(() => {
        // Keep startup resilient if a provider refresh fails.
      });

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  // ── Chat view state (sidebar + content area) ────────────────────
  // Values: "home" | "chats" | "memory" | "agents" | "plugin:<id>:<label>"
  const [chatView, setChatView] = useState<string>("home");
  const pluginTabs = usePluginTabs();

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

  // Chat tools state (shared across modes)
  const [chatSystemPrompt, setChatSystemPrompt] = useState("");
  const [chatTemperature, setChatTemperature] = useState<"precise" | "balanced" | "creative">("balanced");
  const [chatAttachments, setChatAttachments] = useState<Array<{ name: string; path: string; preview: string; content: string; size: number }>>([]);
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
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(true);
  // Work-mode session selection — lifted so the sidebar can show a Files section for the active session
  const [selectedWorkSessionId, setSelectedWorkSessionId] = useState<string | null>(null);
  const [workSessionFilesOpen, setWorkSessionFilesOpen] = useState(false);
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

  // ── RPA platform data (for sidebar badges) ──────────────────────
  const rpaManagedAgentsQ = useManagedAgentsQuery(interactionMode === "work");
  const rpaRunsQ = useAgentRunsQuery(interactionMode === "work");
  const rpaEnvsQ = useEnvironmentsQuery(interactionMode === "work");
  const rpaActiveAgentCount = useMemo(
    () => (rpaManagedAgentsQ.data ?? []).filter(a => a.status === "active").length,
    [rpaManagedAgentsQ.data],
  );
  const rpaLiveSessionCount = useMemo(
    () => (rpaRunsQ.data ?? []).filter(s => s.status === "running" || s.status === "pending").length,
    [rpaRunsQ.data],
  );

  // ── Resolve working dir for the currently-selected work session ───
  const selectedWorkSession = useMemo(
    () => (rpaRunsQ.data ?? []).find((s) => s.id === selectedWorkSessionId) ?? null,
    [rpaRunsQ.data, selectedWorkSessionId],
  );
  const selectedWorkSessionEnv = useMemo(() => {
    if (!selectedWorkSession?.environmentId) return null;
    return (rpaEnvsQ.data ?? []).find((e) => e.id === selectedWorkSession.environmentId) ?? null;
  }, [selectedWorkSession, rpaEnvsQ.data]);
  const sidebarActiveAgentCount = useMemo(
    () => interactionMode === "work" ? rpaActiveAgentCount : agents.filter(a => a.status === "running").length,
    [interactionMode, rpaActiveAgentCount, agents],
  );
  const draftCount = useBuilderChatCount();

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
  const { data: workspaceContext = null } = useWorkspaceContextQuery(
    selectedWorkspaceId,
    selectedConversationId,
    Boolean(selectedWorkspaceId),
  );
  const { data: storedChatDirectory = null } = useSettingQuery("khadim:chat_directory");
  const { data: chatAutoAccessSharedMemorySetting = null } = useSettingQuery("memory:chat_auto_access_shared");
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
    chatSessionToConvRef,
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

  // Enhanced standalone send: prepend system prompt + attachments into the input
  const handleEnhancedStandaloneSend = useCallback(() => {
    // Build context prefix from system prompt and attachments
    const parts: string[] = [];
    if (chatSystemPrompt.trim()) {
      parts.push(`[Instructions: ${chatSystemPrompt.trim()}]`);
    }
    if (chatAttachments.length > 0) {
      for (const file of chatAttachments) {
        parts.push(`<file name="${file.name}" path="${file.path}">\n${file.content}\n</file>`);
      }
    }
    if (parts.length > 0) {
      const prefix = parts.join("\n\n") + "\n\n";
      setStandaloneChatInput(prefix + standaloneChatInput);
      setChatAttachments([]);
      // Defer send to next frame so state settles
      requestAnimationFrame(() => handleStandaloneChatSend());
    } else {
      handleStandaloneChatSend();
    }
  }, [chatSystemPrompt, chatAttachments, standaloneChatInput, handleStandaloneChatSend, setStandaloneChatInput]);

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
    selectedWorkspace,
    activeConversation,
    focusedAgentId,
    agents,
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
    chatSessionToConvRef,
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

  const loadWorkspaceState = useCallback(async (workspace: Workspace) => {
    setLoadingWorkspace(true);
    try {
      const nextConversations = await commands.listConversations(workspace.id);

      // Auto-start the agent backend if not already running
      if (!connection && workspace.backend === "opencode") {
        handleStartOpenCode()
          .catch((err) => console.warn("[auto-start] OpenCode start failed:", err));
      }

      // Merge DB conversations into agents, preserving any live streaming state
      setAgents((prev) => {
        const otherWorkspaceAgents = prev.filter((a) => a.workspaceId !== workspace.id);
        const existingByConvId = new Map(prev.filter((a) => a.workspaceId === workspace.id).map((a) => [a.id, a]));

        const workspaceAgents = nextConversations.map((conv, i) => {
          const existing = existingByConvId.get(conv.id);
          // If agent already exists and is running/streaming, preserve its live state
          if (existing && (existing.status === "running" || existing.streamingContent || existing.streamingSteps.length > 0)) {
            // Still update sessionId from DB in case it was set after initial creation
            return {
              ...existing,
              sessionId: conv.backend_session_id ?? existing.sessionId,
              branch: conv.branch ?? existing.branch,
              worktreePath: conv.worktree_path ?? existing.worktreePath,
            };
          }
          // Otherwise rebuild from DB, but keep label/modelLabel if already set
          const instance = createAgentInstance(
            conv.id,
            workspace.id,
            existing?.label ?? conv.title ?? `Agent ${i + 1}`,
            conv.backend_session_id ?? null,
            existing?.modelLabel ?? null,
            conv.branch ?? null,
            conv.worktree_path ?? null,
          );
          if (existing) {
            // Don't restore "running" from a stale agent — if there's no
            // active streaming content, the stream is dead and we should
            // show idle/complete instead of a permanent spinner.
            const isActuallyStreaming = existing.status === "running" &&
              (existing.streamingContent.length > 0 || existing.streamingSteps.length > 0);
            if (existing.status === "running" && !isActuallyStreaming) {
              instance.status = existing.finishedAt ? "complete" : "idle";
              instance.currentActivity = null;
            } else {
              instance.status = existing.status;
              instance.currentActivity = existing.currentActivity;
            }
            instance.startedAt = existing.startedAt;
            instance.finishedAt = existing.finishedAt;
            instance.errorMessage = existing.errorMessage;
            instance.issueUrl = existing.issueUrl;
          }
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

        // Also keep any agents that exist locally but aren't in DB yet
        // (e.g., just created but mutation hasn't propagated)
        const dbConvIds = new Set(nextConversations.map((c) => c.id));
        const orphanedLocalAgents = prev
          .filter((a) => a.workspaceId === workspace.id && !dbConvIds.has(a.id));

        return [...otherWorkspaceAgents, ...workspaceAgents, ...orphanedLocalAgents];
      });

      const preferredConversation = nextConversations.find((item) => item.is_active) ?? nextConversations[0] ?? null;
      const preferredId = preferredConversation?.id ?? null;
      setSelectedConversationId(preferredId);
      setFocusedAgentId(preferredId);
    } finally {
      setLoadingWorkspace(false);
    }
  }, [connection, handleStartOpenCode]);

  // Load agents for all workspaces on startup (only once)
  const hasLoadedStartupAgentsRef = useRef(false);
  useEffect(() => {
    if (workspaces.length === 0 || hasLoadedStartupAgentsRef.current) return;
    hasLoadedStartupAgentsRef.current = true;
    
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
  // Note: Only run when workspace ID changes, not when connection changes
  // to avoid reloading agents during streaming
  useEffect(() => {
    if (!selectedWorkspaceId || !selectedWorkspace) {
      setSelectedModelOverride(null);
      setFocusedAgentId(null);
      return;
    }
    void loadWorkspaceState(selectedWorkspace).catch((error) => {
      setError(getErrorMessage(error));
    });
  }, [selectedWorkspaceId, selectedWorkspace, loadWorkspaceState]);

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

      if (evt.workspace_id.startsWith("run:")) {
        void queryClient.invalidateQueries({ queryKey: desktopQueryKeys.agentRuns }).catch(() => undefined);
        if (evt.event_type === "step_complete" || evt.event_type === "done" || evt.event_type === "error") {
          void queryClient.invalidateQueries({ queryKey: desktopQueryKeys.agentRunTurns(evt.session_id) }).catch(() => undefined);
        }
      }

      handleAgentStreamEvent(evt);
    }).then((fn) => { unlistenStream = fn; });

    return () => {
      alive = false;
      unlistenOutput?.();
      unlistenReady?.();
      unlistenStream?.();
    };
  }, []);

  const activeProcessOutput = useMemo(
    () => connection
      ? processOutput.filter((line) => line.process_id === connection.process_id)
      : [],
    [connection, processOutput],
  );

  // ── Actions ─────────────────────────────────────────────────────

  // Global Cmd/Ctrl+P to open file finder
  // Use refs to avoid stale closures — the listener is registered once.
  const interactionModeRef = useRef(interactionMode);
  const inWorkspaceRef = useRef(inWorkspace);
  const selectedWorkspaceRef = useRef(selectedWorkspace);
  interactionModeRef.current = interactionMode;
  inWorkspaceRef.current = inWorkspace;
  selectedWorkspaceRef.current = selectedWorkspace;

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        e.stopPropagation();
        if (interactionModeRef.current === "work" && inWorkspaceRef.current && selectedWorkspaceRef.current) {
          setFinderOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, true);
  }, []);

  const handleCloseFinder = useCallback(() => setFinderOpen(false), []);

  const handleToggleTerminal = useCallback(() => setTerminalOpen((o) => !o), []);
  const handleOpenFinder = useCallback(() => setFinderOpen(true), []);
  const handleToggleChanges = useCallback(() => setChangesOpen((o) => !o), []);
  const handleDismissError = useCallback(() => setError(null), []);
  const handleStartOpenCodeWrapped = useCallback(() => void handleStartOpenCode(), [handleStartOpenCode]);
  const handleStopOpenCodeWrapped = useCallback(() => void handleStopOpenCode(), [handleStopOpenCode]);
  const handleChatSendWrapped = useCallback(() => void handleChatSend(), [handleChatSend]);
  const handleAbortWrapped = useCallback(() => void handleAbort(), [handleAbort]);
  const handleNewConversationWrapped = useCallback(() => void handleNewConversation(), [handleNewConversation]);
  const handleStandaloneChatAbortWrapped = useCallback(() => void handleStandaloneChatAbort(), [handleStandaloneChatAbort]);

  const handleOpenFileInEditor = useCallback((path: string) => {
    commands.openInEditor(path).catch((err) => {
      console.warn("Failed to open file:", err);
    });
  }, []);

  const handleOpenProjectInEditor = useCallback(() => {
    const path = workspaceContext?.cwd ?? selectedWorkspace?.worktree_path ?? selectedWorkspace?.repo_path;
    if (!path) return;
    commands.openProjectInEditor(path).catch((err) => {
      console.warn("Failed to open project in editor:", err);
    });
  }, [workspaceContext, selectedWorkspace]);

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
        chatView={chatView}
        onSetChatView={setChatView}
        // Work mode — platform nav
        workView={sidebarWorkView}
        onNavigateWork={handleNavigateWork}
        activeAgentCount={sidebarActiveAgentCount}
        liveSessionCount={rpaLiveSessionCount}
        draftCount={draftCount}
        // Work mode — session files
        activeSessionFilesName={selectedWorkSession?.agentName ?? null}
        activeSessionFilesPath={selectedWorkSessionEnv?.workingDir ?? null}
        onOpenSessionFiles={() => setWorkSessionFilesOpen(true)}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={handleOpenSettings}
        showSettings={showSettings}
      />

      <div className="relative z-10 flex flex-col overflow-hidden" style={FLEX_FILL_STYLE}>
        {/* Error banner */}
        {error && (
          <div className="shrink-0 px-6 pt-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg-strong)] px-4 py-3 text-[12px] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <i className="ri-pause-line text-[16px] leading-none text-[var(--color-danger)]" />
                <span className="text-[var(--color-danger-text)] truncate">{error}</span>
              </div>
              <button className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--color-danger-text)] hover:bg-[var(--color-danger-muted)] transition-colors" onClick={handleDismissError}>Dismiss</button>
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
            chatAutoAccessSharedMemory={chatAutoAccessSharedMemorySetting === "true"}
            onSetChatAutoAccessSharedMemory={(enabled) => {
              void setSettingMutation.mutateAsync({
                key: "memory:chat_auto_access_shared",
                value: enabled ? "true" : "false",
              });
            }}
          />
        )}

        {/* ── CHAT MODE ─────────────────────────────────────────── */}
        {!showSettings && interactionMode === "chat" && (() => {
          // Plugin-owned content: let the custom element fill the pane.
          if (chatView.startsWith("plugin:")) {
            const activeEntry = pluginTabs.find(
              (t) => `plugin:${t.pluginId}:${t.tab.label}` === chatView
            );
            if (activeEntry?.tab.content_element) {
              const tag = activeEntry.tab.content_element;
              return (
                <div key={chatView} style={{ display: "flex", flexDirection: "column", flex: "1 1 0%", minHeight: 0 }}>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(React as any).createElement(tag, {
                    "data-plugin-id": activeEntry.pluginId,
                    style: { flex: 1, minHeight: 0, width: "100%" },
                  })}
                </div>
              );
            }
          }

          if (chatView === "home") {
            return (
              <ChatHomeView
                conversations={chatConversations}
                onSelectChat={(id) => {
                  handleSelectChat(id);
                  setChatView("chats");
                }}
                onNewChat={() => {
                  handleNewStandaloneChat();
                  setChatView("chats");
                }}
                onStartWith={(prompt) => {
                  handleNewStandaloneChat();
                  setStandaloneChatInput(prompt);
                  setChatView("chats");
                }}
                onOpenMemory={() => setChatView("memory")}
                onOpenAgents={() => setChatView("agents")}
              />
            );
          }

          if (chatView === "memory") {
            return <MemoryView />;
          }

          if (chatView === "agents") {
            return (
              <CustomAgentsView
                onRequestChat={(agent) => {
                  handleNewStandaloneChat();
                  setChatSystemPrompt(agent.systemPrompt);
                  setChatView("chats");
                }}
              />
            );
          }

          return (
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
              onSend={handleEnhancedStandaloneSend}
              onStop={handleStandaloneChatAbortWrapped}
              onNewChat={handleNewStandaloneChat}
              isProcessing={activeStandaloneIsProcessing}
              streamingContent={activeStandaloneStreamingContent}
              streamingSteps={activeStandaloneStreamingSteps}
              availableModels={chatAvailableModels}
              selectedModel={chatSelectedModel}
              onSelectModel={(key) => void handleChatSelectModel(key)}
              chatEndRef={chatEndRef}
              systemPrompt={chatSystemPrompt}
              onSystemPromptChange={setChatSystemPrompt}
              temperature={chatTemperature}
              onTemperatureChange={setChatTemperature}
              attachments={chatAttachments}
              onAttachmentsChange={setChatAttachments}
            />
          );
        })()}

        {/* ── WORK MODE — platform views ───────────────────────────── */}
        {!showSettings && interactionMode === "work" && (
            <WorkArea
              view={workView}
              onNavigate={handleNavigateWork}
              selectedSessionId={selectedWorkSessionId}
              onSelectSession={setSelectedWorkSessionId}
              sessionFilesOpen={workSessionFilesOpen}
              onSetSessionFilesOpen={setWorkSessionFilesOpen}
            />
        )}

        {/* ── WORK MODE — inside a workspace ────────────────────── */}
        {!showSettings && interactionMode === "work" && inWorkspace && selectedWorkspace && (
          <div className="flex min-h-0 flex-1 flex-col" style={MIN_HEIGHT_ZERO_STYLE}>
            {/* Context rail — always visible */}
            <WorkspaceContextRail
              context={workspaceContext}
              agentLabel={focusedAgentId ? (focusedAgent?.label ?? null) : null}
              connected={Boolean(connection)}
              terminalOpen={terminalOpen}
              onToggleTerminal={handleToggleTerminal}
              onOpenFinder={handleOpenFinder}
              onOpenInEditor={handleOpenProjectInEditor}
              changesOpen={changesOpen}
              onToggleChanges={handleToggleChanges}
              hasFocusedAgent={Boolean(focusedAgentId)}
            />

            {/* ── Cockpit: center + right dock ────────────────────── */}
            <div className="flex min-h-0 flex-1" style={MIN_HEIGHT_ZERO_STYLE}>

              {/* Center panel — workspace home or agent chat */}
              <div className="flex min-h-0 flex-1 flex-col" style={MIN_HEIGHT_ZERO_STYLE}>
                {!focusedAgentId ? (
                  <WorkspaceView
                    workspace={selectedWorkspace}
                    conversations={conversations}
                    connection={connection}
                    processOutput={activeProcessOutput}
                    gitStatus={gitStatus}
                    gitDiffStat={gitDiffStat}
                    agents={agents}
                    onSelectConversation={handleSelectWorkspaceConversation}
                    onStartOpenCode={handleStartOpenCodeWrapped}
                    onStopOpenCode={handleStopOpenCodeWrapped}
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
                ) : (
                  <ChatView
                    conversationId={selectedConversationId}
                    messages={messages}
                    title={focusedAgent?.label ?? activeConversation?.title ?? "Chat"}
                    subtitle={focusedAgent?.currentActivity ?? (activeConversation ? (activeConversation.title ?? "Active conversation") : "No conversation")}
                    basePath={selectedWorkspace ? (selectedWorkspace.worktree_path ?? selectedWorkspace.repo_path) : null}
                    agent={focusedAgent}
                    onOpenFile={handleOpenFileInEditor}
                    input={agentChatInput}
                    onInputChange={setAgentChatInput}
                    onSend={handleChatSendWrapped}
                    onStop={handleAbortWrapped}
                    onNewChat={handleNewConversationWrapped}
                    isProcessing={focusedAgentIsProcessing}
                    streamingContent={focusedAgentStreamingContent}
                    streamingSteps={focusedAgentStreamingSteps}
                    availableModels={availableModels}
                    selectedModel={selectedModel}
                    onSelectModel={(key) => void handleSelectModel(key)}
                    chatEndRef={chatEndRef}
                    backend={selectedWorkspace?.backend ?? "khadim"}
                    systemPrompt={chatSystemPrompt}
                    onSystemPromptChange={setChatSystemPrompt}
                    temperature={chatTemperature}
                    onTemperatureChange={setChatTemperature}
                    attachments={chatAttachments}
                    onAttachmentsChange={setChatAttachments}
                  />
                )}

                {/* Terminal dock — bottom of center panel */}
                <TerminalDock context={workspaceContext} collapsed={!terminalOpen} onToggleCollapsed={() => setTerminalOpen((o) => !o)} />
              </div>

              {/* Right dock — git changes (visible when agent focused + panel open) */}
              {focusedAgentId && changesOpen && (
                <div className="shrink-0 animate-in" style={GIT_CHANGES_STYLE}>
                  <GitChangesPanel
                    repoPath={selectedWorkspace ? (selectedWorkspace.worktree_path ?? selectedWorkspace.repo_path) : null}
                    isStreaming={focusedAgentIsProcessing}
                    onOpenFile={handleOpenFileInEditor}
                    onClose={() => setChangesOpen(false)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* File finder overlay — rendered outside the z-10 content wrapper via portal so it sits above the sidebar */}
      {finderOpen && createPortal(
        <FileFinder
          context={workspaceContext}
          isOpen={finderOpen}
          onClose={handleCloseFinder}
          onOpenFile={handleOpenFileInEditor}
        />,
        document.body,
      )}

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
            availableModels={availableModels}
            selectedModelKey={selectedModel ? `${selectedModel.provider_id}:${selectedModel.model_id}` : null}
            onSelectModel={(key) => void handleSelectModel(key)}
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
