import { useEffect, useRef, useState, useCallback } from "react";
import type {
  AgentStreamEvent,
  AppError,
  ChatMessage as StoredMessage,
  Conversation,
  CreateWorkspaceInput,
  GitHubAuthStatus,
  OpenCodeConnection,
  OpenCodeModelOption,
  OpenCodeModelRef,
  PendingQuestion,
  ProcessOutput,
  RepoSlug,
  RuntimeSummary,
  ThinkingStepData,
  Workspace,
} from "./lib/bindings";
import { commands, events } from "./lib/bindings";
import { initWebviewZoom } from "./lib/webview-zoom";
import { extractSessionId } from "./lib/ui";
import type { AgentInstance, InteractionMode, WorkHomeView, LocalChatConversation, LocalChatMessage } from "./lib/types";
import { createAgentInstance, createLocalConversation, createLocalMessage } from "./lib/types";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceView } from "./components/WorkspaceView";
import { WorkspaceList } from "./components/WorkspaceList";
import { ChatMessage, TypingIndicator } from "./components/ChatMessage";
import { ChatInput } from "./components/ChatInput";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ActivityChart } from "./components/ActivityChart";
import { CreateWorkspaceModal } from "./components/CreateWorkspaceModal";
import { NewAgentModal } from "./components/NewAgentModal";
import { AgentSettingsModal } from "./components/AgentSettingsModal";
import { ContextBar } from "./components/ContextBar";
import { QuestionOverlay } from "./components/QuestionOverlay";
import { ModifiedFilesPanel } from "./components/ModifiedFilesPanel";
import { SettingsPanel } from "./components/SettingsPanel";

initWebviewZoom();

/* ─── Helpers ──────────────────────────────────────────────────────── */

function getErrorMessage(error: unknown) {
  const raw = error && typeof error === "object" && "message" in error
    ? String((error as AppError).message)
    : "Something went wrong.";

  if (raw.includes("Missing Authentication header") || raw.includes("HTTP 401 Unauthorized")) {
    return "The selected provider is not authenticated. Add or update its API key in Model Settings and try again.";
  }

  if (raw.includes("usage_limit_reached")) {
    return "Your Codex plan has reached its current usage limit. Wait for the reset window or switch to another model/provider.";
  }

  if (raw.includes("HTTP 429 Too Many Requests")) {
    return "The provider is rate limiting requests right now. Please wait a moment and try again.";
  }

  if (raw.includes("No Khadim model is configured")) {
    return "No Khadim model is configured yet. Open Model Settings, save a provider and model, then try again.";
  }

  if (error && typeof error === "object" && "message" in error) {
    return raw;
  }
  return raw;
}

function formatStreamingError(message: string | null | undefined) {
  return getErrorMessage({ message: message ?? "Streaming error" } as AppError);
}

function getModelSettingKey(workspaceId: string) {
  return `opencode:model:${workspaceId}`;
}

const STANDALONE_KHADIM_WORKSPACE_ID = "__chat__";

function getModelKey(model: OpenCodeModelRef) {
  return `${model.provider_id}:${model.model_id}`;
}

function parseStoredModel(value: string | null): OpenCodeModelRef | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<OpenCodeModelRef>;
    if (typeof parsed.provider_id === "string" && typeof parsed.model_id === "string") {
      return { provider_id: parsed.provider_id, model_id: parsed.model_id };
    }
  } catch {
    return null;
  }
  return null;
}

/** Mark any lingering "running" steps as "complete" so they don't stay open forever. */
function finalizeSteps(steps: ThinkingStepData[]): ThinkingStepData[] {
  let changed = false;
  const next = steps.map((step) => {
    if (step.status === "running") {
      changed = true;
      return { ...step, status: "complete" as const };
    }
    return step;
  });
  return changed ? next : steps;
}

function applyStreamingStepEvent(prev: ThinkingStepData[], evt: AgentStreamEvent) {
  const metadata = evt.metadata ?? {};
  const stepId = typeof metadata.id === "string" ? metadata.id : null;
  if (!stepId) return prev;

  const title = typeof metadata.title === "string" ? metadata.title : "Working";
  const tool = typeof metadata.tool === "string" ? metadata.tool : undefined;
  const filename = typeof metadata.filename === "string" ? metadata.filename : undefined;
  const fileContent = typeof metadata.fileContent === "string" ? metadata.fileContent : undefined;
  const filePath = typeof metadata.filePath === "string" ? metadata.filePath : undefined;
  const nextResult = typeof metadata.result === "string" ? metadata.result : undefined;
  const isError = metadata.is_error === true;
  const index = prev.findIndex((step) => step.id === stepId);
  const current = index >= 0 ? prev[index] : { id: stepId, title, status: "running" as const };
  const next: ThinkingStepData = {
    ...current,
    title,
    tool: tool ?? current.tool,
    filename: filename ?? current.filename,
    fileContent: fileContent ?? current.fileContent,
    filePath: filePath ?? current.filePath,
  };

  if (evt.event_type === "step_start") {
    next.status = "running";
    if (evt.content) next.content = evt.content;
  }
  if (evt.event_type === "step_update") {
    next.status = "running";
    if (evt.content) next.content = evt.content;
  }
  if (evt.event_type === "step_complete") {
    next.status = isError ? "error" : "complete";
    if (evt.content) next.content = evt.content;
    if (nextResult) {
      next.result = nextResult;
    } else if (evt.content) {
      next.result = evt.content;
    }
  }

  if (index >= 0) {
    return prev.map((step, idx) => (idx === index ? next : step));
  }
  return [...prev, next];
}

/** Extract the last N non-empty lines from streaming content for sidebar preview */
function extractStreamPreview(content: string, maxLines = 3): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-maxLines);
}

/** Derive the current activity label from thinking steps */
function deriveCurrentActivity(steps: ThinkingStepData[]): string | null {
  const running = steps.filter((s) => s.status === "running");
  if (running.length === 0) return null;
  const last = running[running.length - 1];
  if (last.tool && last.filename) return `${last.tool}: ${last.filename}`;
  if (last.tool) return `${last.tool}...`;
  return last.title;
}

function hasFinishedAfter(startedAt: string | null, createdAt: string | null | undefined) {
  if (!startedAt || !createdAt) return false;
  const started = Date.parse(startedAt);
  const created = Date.parse(createdAt);
  if (Number.isNaN(started) || Number.isNaN(created)) return false;
  return created >= started;
}

/* ─── App ──────────────────────────────────────────────────────────── */

export default function App() {
  // ── Theme ────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("khadim:theme") as "dark" | "light") ?? "dark";
  });

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("khadim:theme", next);
      return next;
    });
  }, []);

  // ── Mode & navigation ───────────────────────────────────────────
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("chat");
  const [workView, setWorkView] = useState<WorkHomeView>("workspaces");
  const [inWorkspace, setInWorkspace] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNewAgentModal, setShowNewAgentModal] = useState(false);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [agentSettingsTarget, setAgentSettingsTarget] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSummary | null>(null);

  // ── Standalone chat state (local, streaming-enabled) ─────────────
  const [chatConversations, setChatConversations] = useState<LocalChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [standaloneChatInput, setStandaloneChatInput] = useState("");
  const activeChatConv = chatConversations.find((c) => c.id === activeChatId) ?? null;
  /** Whether a standalone chat request is currently streaming. */
  const [chatIsProcessing, setChatIsProcessing] = useState(false);
  const [chatStreamingContent, setChatStreamingContent] = useState("");
  const [chatStreamingSteps, setChatStreamingSteps] = useState<ThinkingStepData[]>([]);
  /** Tracks the active session ID for standalone chat so onAgentStream can match events. */
  const chatSessionIdRef = useRef<string | null>(null);
  /** Tracks the active conversation ID so the done/error handler can find it in the ref. */
  const chatActiveConvIdRef = useRef<string | null>(null);
  /** Latest standalone chat conversations for the long-lived event listener. */
  const chatConversationsRef = useRef<LocalChatConversation[]>([]);
  /** Accumulates streamed text for standalone chat so the done handler can read the final value. */
  const chatStreamingContentRef = useRef("");
  /** Accumulates streamed steps for standalone chat so the done handler can read the final value. */
  const chatStreamingStepsRef = useRef<ThinkingStepData[]>([]);
  /** Sessions that already errored so trailing done events do not overwrite the UI state. */
  const chatErroredSessionsRef = useRef<Set<string>>(new Set());
  /** Models available in standalone chat mode. */
  const [chatAvailableModels, setChatAvailableModels] = useState<OpenCodeModelOption[]>([]);
  const [chatSelectedModel, setChatSelectedModel] = useState<OpenCodeModelRef | null>(null);
  /** Configured chat working directory (null = use temp dir). */
  const [chatDirectory, setChatDirectory] = useState<string | null>(null);

  // ── Workspace state ─────────────────────────────────────────────
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  // ── Conversation & messages ─────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);

  // ── Connection & process ────────────────────────────────────────
  const [connection, setConnection] = useState<OpenCodeConnection | null>(null);
  const [processOutput, setProcessOutput] = useState<ProcessOutput[]>([]);
  const [gitStatus, setGitStatus] = useState("");
  const [gitDiffStat, setGitDiffStat] = useState("");
  const [availableModels, setAvailableModels] = useState<OpenCodeModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<OpenCodeModelRef | null>(null);

  // ── Agent instances (multi-agent) ───────────────────────────────
  const [agents, setAgents] = useState<AgentInstance[]>([]);
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);

  // ── GitHub ──────────────────────────────────────────────────────
  const [githubAuthStatus, setGitHubAuthStatus] = useState<GitHubAuthStatus | null>(null);
  const [githubSlug, setGitHubSlug] = useState<RepoSlug | null>(null);

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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const selectedWorkspaceIdRef = useRef<string | null>(null);
  const selectedConversationIdRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  // ── Derived state ───────────────────────────────────────────────
  const activeConversation = conversations.find((item) => item.id === selectedConversationId) ?? null;
  const focusedAgent = agents.find((a) => a.id === focusedAgentId) ?? null;
  const focusedAgentIsProcessing = focusedAgent?.status === "running";
  const focusedAgentStreamingContent = focusedAgent?.streamingContent ?? "";
  const focusedAgentStreamingSteps = focusedAgent?.streamingSteps ?? [];
  const activeStandaloneIsProcessing = activeChatConv?.isProcessing ?? chatIsProcessing;
  const activeStandaloneStreamingContent = activeChatConv?.streamingContent ?? chatStreamingContent;
  const activeStandaloneStreamingSteps = activeChatConv?.streamingSteps ?? chatStreamingSteps;

  useEffect(() => {
    selectedWorkspaceIdRef.current = selectedWorkspaceId;
  }, [selectedWorkspaceId]);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    activeSessionIdRef.current = activeConversation?.backend_session_id ?? null;
  }, [activeConversation?.backend_session_id]);

  useEffect(() => {
    chatConversationsRef.current = chatConversations;
  }, [chatConversations]);

  useEffect(() => {
    chatActiveConvIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    if (!focusedAgent || focusedAgent.status !== "running") return;
    const lastMessage = messages[messages.length - 1];
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
  }, [focusedAgent, messages]);

  useEffect(() => {
    const activeConversation = activeChatConv;
    if (!activeConversation || !activeConversation.isProcessing) return;
    const lastMessage = activeConversation.messages[activeConversation.messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") return;
    if (activeConversation.streamingContent.trim()) return;
    if (activeConversation.streamingSteps.some((step) => step.status === "running")) return;

    setChatConversations((prev) => prev.map((conversation) => {
      if (conversation.id !== activeConversation.id || !conversation.isProcessing) return conversation;
      return {
        ...conversation,
        isProcessing: false,
        streamingContent: "",
        streamingSteps: [],
      };
    }));
    setChatIsProcessing(false);
    setChatStreamingContent("");
    setChatStreamingSteps([]);
  }, [activeChatConv]);

  const selectedModelOption = selectedModel
    ? availableModels.find((model) => getModelKey(model) === getModelKey(selectedModel)) ?? null
    : null;
  const selectedModelLabel = selectedModelOption
    ? `${selectedModelOption.provider_name} / ${selectedModelOption.model_name}`
    : selectedModel
      ? `${selectedModel.provider_id} / ${selectedModel.model_id}`
      : null;

  // ── Data loaders ────────────────────────────────────────────────

  async function refreshWorkspaces() {
    const next = await commands.listWorkspaces();
    setWorkspaces(next);
  }

  async function loadWorkspaceState(workspaceId: string) {
    setLoadingWorkspace(true);
    try {
      const storedModelPromise = commands.getSetting(getModelSettingKey(workspaceId)).catch(() => null);
      const [workspace, nextConversations, nextConnection, storedModelValue, activeKhadimModel] = await Promise.all([
        commands.getWorkspace(workspaceId),
        commands.listConversations(workspaceId),
        commands.getWorkspace(workspaceId).then((value) => value.backend === "opencode"
          ? commands.opencodeGetConnection(workspaceId)
          : Promise.resolve(null)),
        storedModelPromise,
        commands.getWorkspace(workspaceId).then((value) => value.backend === "khadim"
          ? commands.khadimActiveModel()
          : Promise.resolve(null)),
      ]);

      const storedModel = parseStoredModel(storedModelValue);

      setSelectedWorkspace(workspace);
      setConversations(nextConversations);
      setConnection(nextConnection);
      setSelectedModel(storedModel ?? (activeKhadimModel
        ? { provider_id: activeKhadimModel.provider_id, model_id: activeKhadimModel.model_id }
        : null));

      // Auto-start the agent backend if not already running
      if (!nextConnection && workspace.backend === "opencode") {
        commands.opencodeStart(workspace.id)
          .then((started) => commands.opencodeGetConnection(started.workspace_id))
          .then((conn) => { if (conn) setConnection(conn); })
          .catch((err) => console.warn("[auto-start] OpenCode start failed:", err));
      }

      // Build agent instances from existing conversations, restoring persisted token usage.
      const agentInstances = nextConversations.map((conv, i) => {
        const instance = createAgentInstance(
          conv.id,
          conv.title ?? `Agent ${i + 1}`,
          conv.backend_session_id ?? null,
          null,
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
      setAgents(agentInstances);

      const preferredConversation = nextConversations.find((item) => item.is_active) ?? nextConversations[0] ?? null;
      const preferredId = preferredConversation?.id ?? null;
      setSelectedConversationId(preferredId);
      setFocusedAgentId(preferredId);

      const repoPath = workspace.worktree_path ?? workspace.repo_path;
      const [nextGitStatus, nextGitDiff] = await Promise.all([
        commands.gitStatus(repoPath).catch(() => ""),
        commands.gitDiffStat(repoPath).catch(() => ""),
      ]);
      setGitStatus(nextGitStatus);
      setGitDiffStat(nextGitDiff);

      // Load GitHub repo slug from remote URL
      const repoPathForGit = workspace.worktree_path ?? workspace.repo_path;
      if (repoPathForGit) {
        commands.gitRepoInfo(repoPathForGit)
          .then((info) => {
            if (info.remote_url) {
              return commands.githubRepoSlug(info.remote_url);
            }
            return null;
          })
          .then((s) => setGitHubSlug(s ?? null))
          .catch(() => setGitHubSlug(null));
      } else {
        setGitHubSlug(null);
      }
    } finally {
      setLoadingWorkspace(false);
    }
  }

  async function loadMessages(conversationId: string | null) {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    const nextMessages = await commands.listMessages(conversationId);
    // Attach any streaming steps that were captured before the done event.
    const savedSteps = completedStepsRef.current.get(conversationId);
    if (savedSteps && savedSteps.length > 0) {
      // Find the last assistant message and attach the steps.
      for (let i = nextMessages.length - 1; i >= 0; i--) {
        if (nextMessages[i].role === "assistant") {
          (nextMessages[i] as StoredMessage & { thinkingSteps?: ThinkingStepData[] }).thinkingSteps = savedSteps;
          break;
        }
      }
    }
    setMessages(nextMessages);
  }

  // ── Init ────────────────────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      try {
        const summary = await commands.getRuntimeSummary();
        setRuntime(summary);
        await refreshWorkspaces();
        // Load GitHub auth status (fire-and-forget)
        commands.githubAuthStatus().then(setGitHubAuthStatus).catch(() => {});
        // Load chat directory setting
        commands.getSetting("khadim:chat_directory").then((v) => { if (v) setChatDirectory(v); }).catch(() => {});
      } catch (error) {
        setError(getErrorMessage(error));
      }
    })();
  }, []);

  // Load workspace state when entering a workspace
  useEffect(() => {
    if (!selectedWorkspaceId) {
      setSelectedWorkspace(null);
      setConversations([]);
      setConnection(null);
      setAvailableModels([]);
      setSelectedModel(null);
      setGitStatus("");
      setGitDiffStat("");
      setAgents([]);
      setFocusedAgentId(null);
      setGitHubSlug(null);
      return;
    }
    void loadWorkspaceState(selectedWorkspaceId).catch((error) => {
      setError(getErrorMessage(error));
    });
  }, [selectedWorkspaceId]);

  // Load messages when focused conversation changes
  useEffect(() => {
    void loadMessages(selectedConversationId).catch((error) => {
      setError(getErrorMessage(error));
    });
  }, [selectedConversationId]);

  // Load models when connection is available
  useEffect(() => {
    if (!selectedWorkspaceId || !selectedWorkspace) {
      setAvailableModels([]);
      return;
    }

    let alive = true;
    const loadModels = selectedWorkspace.backend === "khadim"
      ? commands.khadimListModels()
      : connection
        ? commands.opencodeListModels(selectedWorkspaceId)
        : Promise.resolve([]);

    void loadModels
      .then(async (models) => {
        if (!alive) return;
        setAvailableModels(models);

        const stored = selectedModel;
        const hasStored = stored && models.some((model) => getModelKey(model) === getModelKey(stored));
        const fallback = models.find((model) => model.is_default) ?? models[0] ?? null;
        const next = hasStored ? stored : fallback ? { provider_id: fallback.provider_id, model_id: fallback.model_id } : null;
        setSelectedModel(next);

        // Update agent model labels
        if (next) {
          const option = models.find((m) => getModelKey(m) === getModelKey(next));
          const label = option ? option.model_name : `${next.provider_id}/${next.model_id}`;
          setAgents((prev) => prev.map((a) => ({ ...a, modelLabel: a.modelLabel ?? label })));
          await commands.setSetting(getModelSettingKey(selectedWorkspaceId), JSON.stringify(next)).catch(() => undefined);
        }
      })
      .catch(() => {
        if (alive) setAvailableModels([]);
      });

    return () => { alive = false; };
  }, [connection, selectedWorkspaceId, selectedWorkspace]);

  // Load models for standalone chat mode
  useEffect(() => {
    if (interactionMode !== "chat") return;
    let alive = true;
    void commands.khadimListModels()
      .then(async (models) => {
        if (!alive) return;
        setChatAvailableModels(models);
        // Restore persisted selection
        const storedValue = await commands.getSetting(getModelSettingKey(STANDALONE_KHADIM_WORKSPACE_ID)).catch(() => null);
        const stored = parseStoredModel(storedValue);
        const hasStored = stored && models.some((m) => getModelKey(m) === getModelKey(stored));
        const fallback = models.find((m) => m.is_default) ?? models[0] ?? null;
        const next = hasStored ? stored : fallback ? { provider_id: fallback.provider_id, model_id: fallback.model_id } : null;
        if (alive) setChatSelectedModel(next);
      })
      .catch(() => {
        if (alive) setChatAvailableModels([]);
      });
    return () => { alive = false; };
  }, [interactionMode]);

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

  // ── Event listeners ─────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    let unlistenOutput: (() => void) | undefined;
    let unlistenReady: (() => void) | undefined;
    let unlistenStream: (() => void) | undefined;

    void events.onProcessOutput((output) => {
      if (!alive) return;
      setProcessOutput((prev) => [...prev.slice(-499), output]);
    }).then((fn) => { unlistenOutput = fn; });

    void events.onOpencodeReady((info) => {
      if (!alive) return;
      if (info.workspace_id === selectedWorkspaceIdRef.current) {
        void commands.opencodeGetConnection(info.workspace_id).then(setConnection).catch(() => undefined);
      }
    }).then((fn) => { unlistenReady = fn; });

    void events.onAgentStream((evt: AgentStreamEvent) => {
      if (!alive) return;

      // ── Standalone chat events (workspace_id === "__chat__") ─────
      const standaloneChatIndex = evt.workspace_id === STANDALONE_KHADIM_WORKSPACE_ID
        ? chatConversationsRef.current.findIndex((conversation) => conversation.sessionId === evt.session_id)
        : -1;
      const isChatSession = standaloneChatIndex >= 0;

      if (isChatSession) {
        const standaloneConversation = chatConversationsRef.current[standaloneChatIndex] ?? null;
        if (evt.event_type === "text_delta" && evt.content) {
          chatErroredSessionsRef.current.delete(evt.session_id);
          setChatConversations((prev) => prev.map((conversation) => {
            if (conversation.sessionId !== evt.session_id) return conversation;
            return {
              ...conversation,
              isProcessing: true,
              streamingContent: conversation.streamingContent + evt.content,
            };
          }));

          if (chatActiveConvIdRef.current === standaloneConversation?.id) {
            chatStreamingContentRef.current += evt.content;
            setChatStreamingContent(chatStreamingContentRef.current);
          }
        } else if (evt.event_type === "step_start" || evt.event_type === "step_update" || evt.event_type === "step_complete") {
          chatErroredSessionsRef.current.delete(evt.session_id);
          setChatConversations((prev) => prev.map((conversation) => {
            if (conversation.sessionId !== evt.session_id) return conversation;
            return {
              ...conversation,
              isProcessing: true,
              streamingSteps: applyStreamingStepEvent(conversation.streamingSteps, evt),
            };
          }));

          if (chatActiveConvIdRef.current === standaloneConversation?.id) {
            chatStreamingStepsRef.current = applyStreamingStepEvent(chatStreamingStepsRef.current, evt);
            setChatStreamingSteps(chatStreamingStepsRef.current);
          }
        } else if (evt.event_type === "done") {
          if (chatErroredSessionsRef.current.has(evt.session_id)) {
            chatErroredSessionsRef.current.delete(evt.session_id);
            return;
          }
          const finalContent = standaloneConversation?.streamingContent ?? "";
          const finalSteps = finalizeSteps(standaloneConversation?.streamingSteps ?? []);
          const convId = standaloneConversation?.id ?? null;

          if (convId && (finalContent || finalSteps.length > 0)) {
            const assistantMsg = createLocalMessage("assistant", finalContent);
            if (finalSteps.length > 0) {
              (assistantMsg as LocalChatMessage).thinkingSteps = finalSteps;
            }
            setChatConversations((convs) =>
              convs.map((c) => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: [...c.messages, assistantMsg],
                  isProcessing: false,
                  streamingContent: "",
                  streamingSteps: [],
                  updatedAt: new Date().toISOString(),
                };
              }),
            );
          } else if (convId) {
            setChatConversations((convs) =>
              convs.map((c) => c.id === convId
                ? { ...c, isProcessing: false, streamingContent: "", streamingSteps: [] }
                : c),
            );
          }

          if (chatActiveConvIdRef.current === standaloneConversation?.id) {
            chatStreamingContentRef.current = "";
            chatStreamingStepsRef.current = [];
            setChatStreamingContent("");
            setChatStreamingSteps([]);
            setChatIsProcessing(false);
          }
        } else if (evt.event_type === "error") {
          chatErroredSessionsRef.current.add(evt.session_id);
          const finalContent = standaloneConversation?.streamingContent ?? "";
          const finalSteps = finalizeSteps(standaloneConversation?.streamingSteps ?? []);
          const convId = standaloneConversation?.id ?? null;

          if (convId && (finalContent || finalSteps.length > 0)) {
            const assistantMsg = createLocalMessage("assistant", finalContent);
            if (finalSteps.length > 0) {
              (assistantMsg as LocalChatMessage).thinkingSteps = finalSteps;
            }
            setChatConversations((convs) =>
              convs.map((c) => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: [...c.messages, assistantMsg],
                  isProcessing: false,
                  streamingContent: "",
                  streamingSteps: [],
                  updatedAt: new Date().toISOString(),
                };
              }),
            );
          } else if (convId) {
            setChatConversations((convs) =>
              convs.map((c) => c.id === convId
                ? { ...c, isProcessing: false, streamingContent: "", streamingSteps: [] }
                : c),
            );
          }

          if (chatActiveConvIdRef.current === standaloneConversation?.id) {
            chatStreamingContentRef.current = "";
            chatStreamingStepsRef.current = [];
            setChatStreamingContent("");
            setChatStreamingSteps([]);
            setChatIsProcessing(false);
          }
          setError(formatStreamingError(evt.content));
        }
        // Chat events handled — don't fall through to workspace handling.
        return;
      }

      // ── Workspace / agent events ────────────────────────────────
      if (evt.workspace_id !== selectedWorkspaceIdRef.current) return;

      const isActiveSession = activeSessionIdRef.current != null && evt.session_id === activeSessionIdRef.current;

      if (evt.event_type === "text_delta" && evt.content) {
        erroredAgentSessionsRef.current.delete(evt.session_id);
        if (isActiveSession) {
          setStreamingContent((prev) => prev + evt.content);
        }

        setAgents((prev) => {
          let changed = false;
          const next = prev.map((agent) => {
            if (agent.sessionId !== evt.session_id) return agent;
            changed = true;
            const newContent = agent.streamingContent + evt.content;
            return {
              ...agent,
              streamingContent: newContent,
              streamPreview: extractStreamPreview(newContent),
              status: "running" as const,
            };
          });
          return changed ? next : prev;
        });
      } else if (evt.event_type === "step_start" || evt.event_type === "step_update" || evt.event_type === "step_complete") {
        erroredAgentSessionsRef.current.delete(evt.session_id);
        if (isActiveSession) {
          setStreamingSteps((prev) => applyStreamingStepEvent(prev, evt));
        }

        setAgents((prev) => {
          let changed = false;
          const next = prev.map((agent) => {
            if (agent.sessionId !== evt.session_id) return agent;
            changed = true;
            const newSteps = applyStreamingStepEvent(agent.streamingSteps, evt);
            return {
              ...agent,
              streamingSteps: newSteps,
              currentActivity: deriveCurrentActivity(newSteps),
              status: "running" as const,
            };
          });
          return changed ? next : prev;
        });
      } else if (evt.event_type === "question" && isActiveSession && evt.metadata) {
        // Agent is asking the user a question — show the overlay.
        const meta = evt.metadata as Record<string, unknown>;
        const id = typeof meta.id === "string" ? meta.id : "";
        const questions = Array.isArray(meta.questions) ? meta.questions : [];
        if (id && questions.length > 0) {
          setPendingQuestion({
            id,
            questions: questions as PendingQuestion["questions"],
          });
        }
      } else if (evt.event_type === "done") {
        if (erroredAgentSessionsRef.current.has(evt.session_id)) {
          erroredAgentSessionsRef.current.delete(evt.session_id);
          return;
        }
        if (isActiveSession && selectedConversationIdRef.current) {
          // Snapshot the streaming steps so they survive the reload from DB.
          // Finalize any still-running steps so they don't stay open forever.
          setStreamingSteps((prev) => {
            if (prev.length > 0 && selectedConversationIdRef.current) {
              completedStepsRef.current.set(selectedConversationIdRef.current, finalizeSteps(prev));
            }
            return [];
          });
          setIsProcessing(false);
          setStreamingContent("");
          setPendingQuestion(null);
          void loadMessages(selectedConversationIdRef.current).catch(() => {});
        }

        setAgents((prev) => {
          let changed = false;
          const next = prev.map((agent) => {
            if (agent.sessionId !== evt.session_id) return agent;
            changed = true;
            return {
              ...agent,
              status: "complete" as const,
              streamingContent: "",
              streamPreview: [],
              streamingSteps: [],
              currentActivity: null,
              finishedAt: new Date().toISOString(),
            };
          });
          return changed ? next : prev;
        });
      } else if (evt.event_type === "usage_update" && evt.metadata) {
        erroredAgentSessionsRef.current.delete(evt.session_id);
        const inputTokens      = (evt.metadata as Record<string, number>).input_tokens      ?? 0;
        const outputTokens     = (evt.metadata as Record<string, number>).output_tokens     ?? 0;
        const cacheReadTokens  = (evt.metadata as Record<string, number>).cache_read_tokens  ?? 0;
        const cacheWriteTokens = (evt.metadata as Record<string, number>).cache_write_tokens ?? 0;

        setAgents((prev) => {
          let changed = false;
          const next = prev.map((agent) => {
            if (agent.sessionId !== evt.session_id) return agent;
            changed = true;
            return {
              ...agent,
              tokenUsage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
            };
          });
          return changed ? next : prev;
        });
      } else if (evt.event_type === "error") {
        erroredAgentSessionsRef.current.add(evt.session_id);
        if (isActiveSession && selectedConversationIdRef.current) {
          setStreamingSteps((prev) => {
            if (prev.length > 0 && selectedConversationIdRef.current) {
              completedStepsRef.current.set(selectedConversationIdRef.current, finalizeSteps(prev));
            }
            return [];
          });
          setIsProcessing(false);
          setStreamingContent("");
          setPendingQuestion(null);
          setError(formatStreamingError(evt.content));
          void loadMessages(selectedConversationIdRef.current).catch(() => {});
        }

        setAgents((prev) => {
          let changed = false;
          const next = prev.map((agent) => {
            if (agent.sessionId !== evt.session_id) return agent;
            changed = true;
            return {
              ...agent,
              status: "error" as const,
              streamingContent: "",
              streamPreview: [],
              streamingSteps: [],
              currentActivity: null,
              errorMessage: formatStreamingError(evt.content),
              finishedAt: new Date().toISOString(),
            };
          });
          return changed ? next : prev;
        });
      }
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

  const handleCreateWorkspace = useCallback(async (input: CreateWorkspaceInput) => {
    setIsCreatingWorkspace(true);
    setError(null);
    try {
      const created = await commands.createWorkspace(input);
      await refreshWorkspaces();
      setSelectedWorkspaceId(created.id);
      setInWorkspace(true);
    } catch (error) {
      setError(getErrorMessage(error));
      throw error;
    } finally {
      setIsCreatingWorkspace(false);
    }
  }, []);

  const handleEnterWorkspace = useCallback((id: string) => {
    setSelectedWorkspaceId(id);
    setInWorkspace(true);
  }, []);

  const handleExitWorkspace = useCallback(() => {
    setInWorkspace(false);
    setWorkView("workspaces");
    // Keep selectedWorkspaceId so sidebar can highlight it, but exit workspace mode
  }, []);

  const handleDeleteWorkspace = useCallback(async (id: string) => {
    try {
      // If we're deleting the currently-selected workspace, exit workspace mode
      if (id === selectedWorkspaceId) {
        setInWorkspace(false);
        setWorkView("workspaces");
        setSelectedWorkspaceId(null);
      }
      await commands.deleteWorkspace(id);
      await refreshWorkspaces();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [selectedWorkspaceId]);

  const handleWorkspaceBranchChange = useCallback(async (branch: string) => {
    if (!selectedWorkspace) return;
    await commands.setWorkspaceBranch(selectedWorkspace.id, branch);
    await refreshWorkspaces();
    const updated = await commands.getWorkspace(selectedWorkspace.id);
    setSelectedWorkspace(updated);
  }, [selectedWorkspace]);

  async function ensureOpenCodeStarted(workspace: Workspace) {
    if (connection) return connection;
    const started = await commands.opencodeStart(workspace.id);
    const nextConnection = await commands.opencodeGetConnection(started.workspace_id);
    setConnection(nextConnection);
    return nextConnection;
  }

  async function handleStartOpenCode() {
    if (!selectedWorkspace) return;
    setError(null);
    try {
      await ensureOpenCodeStarted(selectedWorkspace);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }

  async function handleStopOpenCode() {
    if (!selectedWorkspace) return;
    setError(null);
    try {
      await commands.opencodeStop(selectedWorkspace.id);
      setConnection(null);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }

  async function handleNewConversation() {
    if (!selectedWorkspace) return null;
    setError(null);
    try {
      const nextConnection = selectedWorkspace.backend === "opencode"
        ? await ensureOpenCodeStarted(selectedWorkspace)
        : null;

      const conversation = await commands.createConversation(selectedWorkspace.id);
      let updatedConversation = conversation;

      if (selectedWorkspace.backend === "opencode") {
        const session = await commands.opencodeCreateSession(selectedWorkspace.id);
        const sessionId = extractSessionId(session);
        if (!sessionId) {
          throw new Error("OpenCode session created but no session ID was returned.");
        }
        await commands.setConversationBackendSession(conversation.id, sessionId);
        updatedConversation = { ...conversation, backend_session_id: sessionId };
      } else if (selectedWorkspace.backend === "khadim") {
        const session = await commands.khadimCreateSession(selectedWorkspace.id);
        await commands.setConversationBackendSession(conversation.id, session.id);
        updatedConversation = { ...conversation, backend_session_id: session.id };
      }

      const nextConversations = await commands.listConversations(selectedWorkspace.id);
      setConversations(nextConversations);
      setSelectedConversationId(updatedConversation.id);

      // Create agent instance for this conversation
      const agentNumber = agents.length + 1;
      const modelLabel = selectedModelOption ? selectedModelOption.model_name : null;
      const newAgent = createAgentInstance(
        updatedConversation.id,
        `Agent ${agentNumber}`,
        updatedConversation.backend_session_id ?? null,
        modelLabel,
      );
      setAgents((prev) => [...prev, newAgent]);
      setFocusedAgentId(updatedConversation.id);

      setMessages([]);
      setConnection(nextConnection);

      // If not in workspace yet, switch to workspace mode
      if (!inWorkspace) {
        setInWorkspace(true);
      }

      return updatedConversation;
    } catch (error) {
      setError(getErrorMessage(error));
      return null;
    }
  }

  async function handleChatSend() {
    if (!selectedWorkspace || !agentChatInput.trim()) return;

    let conversation = activeConversation;
    if (!conversation) {
      conversation = await handleNewConversation();
    }
    if (!conversation?.backend_session_id) {
      setError("Create a conversation before sending a message.");
      return;
    }

    const content = agentChatInput.trim();
    let modelForSend = selectedModel;
    if (!modelForSend && selectedWorkspace.backend === "opencode") {
      const models = await commands.opencodeListModels(selectedWorkspace.id).catch(() => []);
      if (models.length > 0) {
        setAvailableModels(models);
        const fallback = models.find((model) => model.is_default) ?? models[0];
        modelForSend = { provider_id: fallback.provider_id, model_id: fallback.model_id };
        setSelectedModel(modelForSend);
        await commands.setSetting(getModelSettingKey(selectedWorkspace.id), JSON.stringify(modelForSend)).catch(() => undefined);
      }
    } else if (!modelForSend && selectedWorkspace.backend === "khadim") {
      const models = await commands.khadimListModels().catch(() => []);
      if (models.length > 0) {
        setAvailableModels(models);
        const fallback = models.find((model) => model.is_default) ?? models[0];
        modelForSend = { provider_id: fallback.provider_id, model_id: fallback.model_id };
        setSelectedModel(modelForSend);
        await commands.setSetting(getModelSettingKey(selectedWorkspace.id), JSON.stringify(modelForSend)).catch(() => undefined);
      }
    }

    setAgentChatInput("");
    setIsProcessing(true);
    setStreamingContent("");
    setStreamingSteps([]);
    erroredAgentSessionsRef.current.delete(conversation.backend_session_id);
    setError(null);

    // Mark agent as running
    if (focusedAgentId) {
      setAgents((prev) => prev.map((a) => {
        if (a.id !== focusedAgentId) return a;
        return { ...a, status: "running", startedAt: new Date().toISOString(), streamingContent: "", streamPreview: [], streamingSteps: [], currentActivity: "Starting..." };
      }));
    }

    try {
      if (selectedWorkspace.backend === "khadim") {
        await commands.khadimSendStreaming(
          selectedWorkspace.id,
          conversation.backend_session_id,
          conversation.id,
          content,
          modelForSend,
        );
      } else {
        await commands.opencodeSendStreaming(
          selectedWorkspace.id,
          conversation.backend_session_id,
          conversation.id,
          content,
          modelForSend,
        );
      }
      await loadMessages(conversation.id);
    } catch (error) {
      setError(getErrorMessage(error));
      setIsProcessing(false);
      setStreamingContent("");
      setStreamingSteps([]);
      // Mark agent as errored
      if (focusedAgentId) {
        setAgents((prev) => prev.map((a) => {
          if (a.id !== focusedAgentId) return a;
          return { ...a, status: "error", errorMessage: getErrorMessage(error), finishedAt: new Date().toISOString() };
        }));
      }
    }
  }

  async function handleAbort() {
    if (!selectedWorkspace || !activeConversation?.backend_session_id) return;
    try {
      if (selectedWorkspace.backend === "khadim") {
        await commands.khadimAbort(activeConversation.backend_session_id);
      } else {
        await commands.opencodeAbort(selectedWorkspace.id, activeConversation.backend_session_id);
      }
      setIsProcessing(false);
      setStreamingContent("");
      setStreamingSteps([]);
      erroredAgentSessionsRef.current.delete(activeConversation.backend_session_id);
      setAgents((prev) => prev.map((agent) => {
        if (agent.sessionId !== activeConversation.backend_session_id) return agent;
        return {
          ...agent,
          status: "idle",
          streamingContent: "",
          streamPreview: [],
          streamingSteps: [],
          currentActivity: null,
        };
      }));
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }

  async function handleSelectModel(modelKey: string) {
    if (!selectedWorkspaceId) return;
    const next = availableModels.find((model) => `${model.provider_id}:${model.model_id}` === modelKey);
    if (!next) return;
    const value = { provider_id: next.provider_id, model_id: next.model_id };
    setSelectedModel(value);
    await commands.setSetting(getModelSettingKey(selectedWorkspaceId), JSON.stringify(value));
  }

  const handleFocusAgent = useCallback((agentId: string) => {
    setFocusedAgentId(agentId);
    // Set the corresponding conversation as selected
    setSelectedConversationId(agentId);
    // Load messages for this conversation
    void loadMessages(agentId).catch(() => {});
  }, []);

  const handleRemoveAgent = useCallback(async (agentId: string, deleteWorktree = true) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;

    // 1. Abort if running
    if (agent.status === "running" && agent.sessionId && selectedWorkspace) {
      if (selectedWorkspace.backend === "khadim") {
        await commands.khadimAbort(agent.sessionId).catch(() => {});
      } else {
        await commands.opencodeAbort(selectedWorkspace.id, agent.sessionId).catch(() => {});
      }
    }

    // 2. Delete conversation from the database
    await commands.deleteConversation(agentId).catch(() => {});

    // 3. Remove worktree if present and user opted in
    if (deleteWorktree && agent.worktreePath && selectedWorkspace) {
      await commands.gitRemoveWorktree(selectedWorkspace.repo_path, agent.worktreePath, false).catch(() => {});
    }

    // 4. Update conversations list
    if (selectedWorkspace) {
      const nextConversations = await commands.listConversations(selectedWorkspace.id).catch(() => conversations);
      setConversations(nextConversations);
    }

    // 5. Remove from React state and re-focus
    setAgents((prev) => {
      const next = prev.filter((a) => a.id !== agentId);
      if (focusedAgentId === agentId) {
        const nextFocus = next.length > 0 ? next[next.length - 1].id : null;
        setTimeout(() => {
          setFocusedAgentId(nextFocus);
          setSelectedConversationId(nextFocus);
          if (nextFocus) {
            void loadMessages(nextFocus).catch(() => {});
          } else {
            setMessages([]);
          }
        }, 0);
      }
      return next;
    });

    // 6. Close settings modal if it was open for this agent
    if (agentSettingsTarget === agentId) {
      setAgentSettingsTarget(null);
    }
  }, [focusedAgentId, agents, selectedWorkspace, conversations, agentSettingsTarget]);

  const handleRenameAgent = useCallback((agentId: string, newLabel: string) => {
    setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, label: newLabel } : a));
  }, []);

  /** Create a new agent with a dedicated worktree.
   *  Called by NewAgentModal after it creates the worktree on disk. */
  const handleCreateAgentWithWorktree = useCallback(async (branch: string, worktreePath: string, label: string) => {
    if (!selectedWorkspace) return;
    setIsCreatingAgent(true);
    setError(null);
    try {
      const nextConnection = selectedWorkspace.backend === "opencode"
        ? await ensureOpenCodeStarted(selectedWorkspace)
        : null;

      const conversation = await commands.createConversation(selectedWorkspace.id);
      let updatedConversation = conversation;

      if (selectedWorkspace.backend === "opencode") {
        const session = await commands.opencodeCreateSession(selectedWorkspace.id);
        const sessionId = extractSessionId(session);
        if (!sessionId) {
          throw new Error("OpenCode session created but no session ID was returned.");
        }
        await commands.setConversationBackendSession(conversation.id, sessionId);
        updatedConversation = { ...conversation, backend_session_id: sessionId };
      } else if (selectedWorkspace.backend === "khadim") {
        const session = await commands.khadimCreateSession(selectedWorkspace.id);
        await commands.setConversationBackendSession(conversation.id, session.id);
        updatedConversation = { ...conversation, backend_session_id: session.id };
      }

      const nextConversations = await commands.listConversations(selectedWorkspace.id);
      setConversations(nextConversations);
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

      setMessages([]);
      setConnection(nextConnection);

      if (!inWorkspace) {
        setInWorkspace(true);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsCreatingAgent(false);
    }
  }, [selectedWorkspace, inWorkspace, selectedModelOption]);

  /** Handle a question answer from the overlay — format and send as a message. */
  const handleQuestionAnswer = useCallback(async (answers: string[]) => {
    setPendingQuestion(null);
    if (!selectedWorkspace || !activeConversation?.backend_session_id) return;

    // Format answers into a human-readable reply string
    const reply = answers.filter(Boolean).join("\n");
    if (!reply) return;

    setAgentChatInput("");
    setIsProcessing(true);
    setStreamingContent("");
    setStreamingSteps([]);
    erroredAgentSessionsRef.current.delete(activeConversation.backend_session_id);
    setError(null);

    if (focusedAgentId) {
      setAgents((prev) => prev.map((a) => {
        if (a.id !== focusedAgentId) return a;
        return { ...a, status: "running" as const, streamingContent: "", streamPreview: [], streamingSteps: [], currentActivity: "Answering question..." };
      }));
    }

    try {
      if (selectedWorkspace.backend === "khadim") {
        await commands.khadimSendStreaming(
          selectedWorkspace.id,
          activeConversation.backend_session_id,
          activeConversation.id,
          reply,
          selectedModel,
        );
      } else {
        await commands.opencodeSendStreaming(
          selectedWorkspace.id,
          activeConversation.backend_session_id,
          activeConversation.id,
          reply,
          selectedModel,
        );
      }
      await loadMessages(activeConversation.id);
    } catch (err) {
      setError(getErrorMessage(err));
      setIsProcessing(false);
      setStreamingContent("");
      setStreamingSteps([]);
    }
  }, [selectedWorkspace, activeConversation, selectedModel, focusedAgentId]);

  /** Dismiss a pending question without answering. */
  const handleQuestionDismiss = useCallback(() => {
    setPendingQuestion(null);
  }, []);

  /** Show workspace overview (unfocus any agent) */
  const handleManageWorkspace = useCallback(() => {
    setFocusedAgentId(null);
    setSelectedConversationId(null);
  }, []);

  /** Open the agent settings modal */
  const handleManageAgent = useCallback((agentId: string) => {
    setAgentSettingsTarget(agentId);
  }, []);

  // ── Standalone chat actions ─────────────────────────────────────

  const handleNewStandaloneChat = useCallback(() => {
    const conv = createLocalConversation();
    setChatConversations((prev) => [conv, ...prev]);
    setActiveChatId(conv.id);
    setStandaloneChatInput("");
  }, []);

  const handleDeleteStandaloneChat = useCallback((id: string) => {
    setChatConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (activeChatId === id) {
        setActiveChatId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  }, [activeChatId]);

  const handleStandaloneChatSend = useCallback(() => {
    const text = standaloneChatInput.trim();
    if (!text || activeStandaloneIsProcessing) return;

    let convId = activeChatId;

    // Auto-create a conversation if none selected
    if (!convId) {
      const conv = createLocalConversation(text.slice(0, 40));
      setChatConversations((prev) => [conv, ...prev]);
      convId = conv.id;
      setActiveChatId(convId);
    }

    const userMsg = createLocalMessage("user", text);

    setChatConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        // Set title from first message if still default
        const title = c.messages.length === 0 ? text.slice(0, 40) : c.title;
        return {
          ...c,
          title,
          messages: [...c.messages, userMsg],
          isProcessing: true,
          streamingContent: "",
          streamingSteps: [],
          updatedAt: new Date().toISOString(),
        };
      }),
    );
    setStandaloneChatInput("");
    setChatIsProcessing(true);
    setChatStreamingContent("");
    setChatStreamingSteps([]);
    chatStreamingContentRef.current = "";
    chatStreamingStepsRef.current = [];
    if (chatSessionIdRef.current) {
      chatErroredSessionsRef.current.delete(chatSessionIdRef.current);
    }
    setError(null);

    // Keep the convId accessible to the done/error handler via ref.
    chatActiveConvIdRef.current = convId;

    void (async () => {
      try {
        // Ensure we have a session
        let sessionId = chatConversations.find((c) => c.id === convId)?.sessionId ?? null;
        if (!sessionId) {
          const created = await commands.khadimCreateSession(null);
          sessionId = created.id;
          setChatConversations((prev) => prev.map((c) => c.id === convId ? { ...c, sessionId } : c));
        }
        chatSessionIdRef.current = sessionId;

        // Resolve model — lazy-load if needed
        let modelForSend = chatSelectedModel;
        if (!modelForSend) {
          const models = await commands.khadimListModels().catch(() => []);
          if (models.length > 0) {
            setChatAvailableModels(models);
            const fallback = models.find((m) => m.is_default) ?? models[0];
            modelForSend = { provider_id: fallback.provider_id, model_id: fallback.model_id };
            setChatSelectedModel(modelForSend);
            await commands.setSetting(getModelSettingKey(STANDALONE_KHADIM_WORKSPACE_ID), JSON.stringify(modelForSend)).catch(() => undefined);
          }
        }

        await commands.khadimSendStreaming(
          STANDALONE_KHADIM_WORKSPACE_ID,
          sessionId,
          null,        // no DB conversation — local only
          text,
          modelForSend,
        );
        // The done/error event handler in onAgentStream will finalize the message.
      } catch (err) {
        setChatIsProcessing(false);
        setChatStreamingContent("");
        setChatStreamingSteps([]);
        chatStreamingContentRef.current = "";
        chatStreamingStepsRef.current = [];
        setError(getErrorMessage(err));
      }
    })();
  }, [standaloneChatInput, activeChatId, chatConversations, activeStandaloneIsProcessing, chatSelectedModel]);

  const handleStandaloneChatAbort = useCallback(async () => {
    const sessionId = chatSessionIdRef.current;
    if (!sessionId) return;
    try {
      await commands.khadimAbort(sessionId);
      setChatIsProcessing(false);
      setChatStreamingContent("");
      setChatStreamingSteps([]);
      chatStreamingContentRef.current = "";
      chatStreamingStepsRef.current = [];
      chatErroredSessionsRef.current.delete(sessionId);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  const handleChatSelectModel = useCallback(async (modelKey: string) => {
    const next = chatAvailableModels.find((m) => `${m.provider_id}:${m.model_id}` === modelKey);
    if (!next) return;
    const value = { provider_id: next.provider_id, model_id: next.model_id };
    setChatSelectedModel(value);
    await commands.setSetting(getModelSettingKey(STANDALONE_KHADIM_WORKSPACE_ID), JSON.stringify(value));
  }, [chatAvailableModels]);

  /** Update the chat working directory setting. Pass null to clear (revert to temp dir). */
  const handleChatDirectoryChange = useCallback(async (dir: string | null) => {
    setChatDirectory(dir);
    if (dir) {
      await commands.setSetting("khadim:chat_directory", dir);
    } else {
      // Clear the setting — next chat session will use the temp dir fallback.
      await commands.setSetting("khadim:chat_directory", "");
    }
  }, []);

  // ── Render helpers ──────────────────────────────────────────────

  /** Render the standalone chat view (no workspace, no agent) */
  function renderStandaloneChat() {
    const chatMessages = activeChatConv?.messages ?? [];
    const chatModelOption = chatSelectedModel
      ? chatAvailableModels.find((m) => getModelKey(m) === getModelKey(chatSelectedModel)) ?? null
      : null;
    const chatModelLabel = chatModelOption
      ? `${chatModelOption.provider_name} / ${chatModelOption.model_name}`
      : chatSelectedModel
        ? `${chatSelectedModel.provider_id} / ${chatSelectedModel.model_id}`
        : null;
    const hasContent = chatMessages.length > 0 || activeStandaloneIsProcessing;

    return (
      <div className="relative flex flex-col overflow-hidden" style={{ flex: "1 1 0%", minHeight: 0 }}>
        {/* Header */}
        <div className="shrink-0 px-6 py-3 border-b border-[var(--glass-border)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {activeStandaloneIsProcessing && (
              <div className="w-2 h-2 rounded-full shrink-0 bg-[var(--color-accent)] animate-pulse" />
            )}
            <svg className="w-4 h-4 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {activeChatConv?.title ?? "Chat"}
              </h2>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                {chatDirectory
                  ? <>
                      <span className="opacity-60">cwd:</span>{" "}
                      <span title={chatDirectory}>{chatDirectory}</span>
                    </>
                  : activeChatConv ? `${chatMessages.length} messages` : "Start a new conversation"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {chatModelLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-full glass-panel px-2.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                {chatModelLabel}
              </span>
            )}
            <button
              onClick={handleNewStandaloneChat}
              className="h-7 px-2.5 rounded-xl text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            >
              New
            </button>
          </div>
        </div>

        {/* Messages area */}
        <main
          className={`min-h-0 flex-1 overflow-y-auto scrollbar-thin ${
            !hasContent
              ? "px-0 py-6"
              : "pb-36 pt-3 sm:pb-44 md:pb-52 md:pt-6"
          }`}
        >
          {!hasContent ? (
            <WelcomeScreen
              input={standaloneChatInput}
              setInput={setStandaloneChatInput}
              onSend={handleStandaloneChatSend}
              compact
              hideInput
            />
          ) : (
            <div className="mx-auto flex max-w-3xl gap-4 px-4 md:px-6">
              <div className="min-w-0 flex-1">
                <div className="rounded-3xl p-5 glass-card-static">
                  <div className="space-y-5">
                    {chatMessages.map((msg) => (
                      <ChatMessage
                        key={msg.id}
                        message={{
                          id: msg.id,
                          conversation_id: activeChatConv?.id ?? "",
                          role: msg.role,
                          content: msg.content,
                          metadata: null,
                          created_at: msg.createdAt,
                          thinkingSteps: msg.thinkingSteps,
                        }}
                      />
                    ))}
                    {activeStandaloneIsProcessing && (activeStandaloneStreamingContent || activeStandaloneStreamingSteps.length > 0) && (
                      <ChatMessage
                        message={{
                          id: "__chat-streaming__",
                          conversation_id: activeChatConv?.id ?? "",
                          role: "assistant",
                          content: activeStandaloneStreamingContent,
                          metadata: null,
                          created_at: new Date().toISOString(),
                          thinkingSteps: activeStandaloneStreamingSteps,
                        }}
                        isStreaming
                      />
                    )}
                    {activeStandaloneIsProcessing && !activeStandaloneStreamingContent && activeStandaloneStreamingSteps.length === 0 && <TypingIndicator />}
                    <div ref={chatEndRef} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Floating input */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
          <div className="h-8 sm:h-16 bg-gradient-to-t from-[var(--surface-bg)] to-transparent" />
          <div className="pointer-events-auto bg-[var(--surface-bg)]">
            <ChatInput
              value={standaloneChatInput}
              onChange={setStandaloneChatInput}
              onSend={handleStandaloneChatSend}
              onStop={() => void handleStandaloneChatAbort()}
              isProcessing={activeStandaloneIsProcessing}
              availableModels={chatAvailableModels}
              selectedModelKey={chatSelectedModel ? getModelKey(chatSelectedModel) : null}
              onSelectModel={(key) => void handleChatSelectModel(key)}
              modelDisabled={activeStandaloneIsProcessing}
            />
          </div>
        </div>
      </div>
    );
  }

  /** Render the chat/conversation view for the focused agent */
  function renderAgentChat() {
    return (
      <div className="relative flex flex-col overflow-hidden" style={{ flex: "1 1 0%", minHeight: 0 }}>
        {/* Header */}
        <div className="shrink-0 px-6 py-3 border-b border-[var(--glass-border)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {focusedAgent && (
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                focusedAgent.status === "running" ? "bg-[var(--color-accent)] animate-pulse"
                  : focusedAgent.status === "complete" ? "bg-[var(--color-success)]"
                  : focusedAgent.status === "error" ? "bg-[var(--color-danger)]"
                  : "bg-[var(--scrollbar-thumb)]"
              }`} />
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {focusedAgent?.label ?? activeConversation?.title ?? "Chat"}
              </h2>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {focusedAgent?.currentActivity
                  ?? (activeConversation ? (activeConversation.title ?? "Active conversation") : "No conversation")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedModelLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-full glass-panel px-2.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                {selectedModelLabel}
              </span>
            )}
            <button
              onClick={() => void handleNewConversation()}
              className="h-7 px-2.5 rounded-xl text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            >
              New
            </button>
          </div>
        </div>

        {/* Context usage bar — shown whenever an agent has token data */}
        <ContextBar agent={focusedAgent} isStreaming={focusedAgentIsProcessing} />

        {/* Messages area */}
        <main
          className={`min-h-0 flex-1 overflow-y-auto scrollbar-thin ${
            messages.length === 0 && !focusedAgentIsProcessing
              ? "px-0 py-6"
              : "pb-36 pt-3 sm:pb-44 md:pb-52 md:pt-6"
          }`}
        >
          {messages.length === 0 && !focusedAgentIsProcessing ? (
            <WelcomeScreen
              input={agentChatInput}
              setInput={setAgentChatInput}
              onSend={() => void handleChatSend()}
              compact
              hideInput
            />
          ) : (
            <div className="mx-auto flex max-w-6xl gap-4 px-4 md:px-6">
              {/* Chat column */}
              <div className="min-w-0 flex-1 max-w-3xl">
                <div className="rounded-3xl p-5 glass-card-static">
                  <div className="space-y-5">
                    {messages.map((msg) => (
                      <ChatMessage key={msg.id} message={msg} basePath={selectedWorkspace?.worktree_path ?? selectedWorkspace?.repo_path} />
                    ))}
                    {focusedAgentIsProcessing && (focusedAgentStreamingContent || focusedAgentStreamingSteps.length > 0) && (
                      <ChatMessage
                        message={{
                          id: "__streaming__",
                          conversation_id: selectedConversationId ?? "",
                          role: "assistant",
                          content: focusedAgentStreamingContent,
                          metadata: null,
                          created_at: new Date().toISOString(),
                          thinkingSteps: focusedAgentStreamingSteps,
                        }}
                        isStreaming
                        basePath={selectedWorkspace?.worktree_path ?? selectedWorkspace?.repo_path}
                      />
                    )}
                    {focusedAgentIsProcessing && !focusedAgentStreamingContent && focusedAgentStreamingSteps.length === 0 && <TypingIndicator />}
                    <div ref={chatEndRef} />
                  </div>
                </div>
              </div>

              {/* Modified files side panel */}
              <div className="hidden xl:block w-[260px] shrink-0 sticky top-0 self-start">
                <ModifiedFilesPanel
                  repoPath={selectedWorkspace?.worktree_path ?? selectedWorkspace?.repo_path}
                  isStreaming={focusedAgentIsProcessing}
                  onOpenFile={(path) => {
                    commands.openInEditor(path).catch((err) => {
                      console.warn("Failed to open file:", err);
                    });
                  }}
                />
              </div>
            </div>
          )}
        </main>

        {/* Floating input */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
          <div className="h-8 sm:h-16 bg-gradient-to-t from-[var(--surface-bg)] to-transparent" />
          <div className="pointer-events-auto bg-[var(--surface-bg)]">
            <ChatInput
              value={agentChatInput}
              onChange={setAgentChatInput}
              onSend={() => void handleChatSend()}
              onStop={() => void handleAbort()}
              isProcessing={focusedAgentIsProcessing}
              availableModels={availableModels}
              selectedModelKey={selectedModel ? getModelKey(selectedModel) : null}
              onSelectModel={(key) => void handleSelectModel(key)}
              modelDisabled={focusedAgentIsProcessing}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Derive sidebar work view ────────────────────────────────────
  const sidebarWorkView: WorkHomeView | "workspace" = inWorkspace ? "workspace" : workView;

  // ── Main render ─────────────────────────────────────────────────

  return (
    <div className="glass-page-shell flex h-full max-h-full overflow-hidden" data-theme={theme}>
      <Sidebar
        mode={interactionMode}
        onSwitchMode={setInteractionMode}
        // Chat mode props
        chatConversations={chatConversations}
        activeChatId={activeChatId}
        onSelectChat={setActiveChatId}
        onNewChat={handleNewStandaloneChat}
        onDeleteChat={handleDeleteStandaloneChat}
        // Work mode — home props
        workView={sidebarWorkView}
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelectWorkspace={handleEnterWorkspace}
        onNavigateWork={setWorkView}
        onNewWorkspace={() => setShowCreateModal(true)}
        // Work mode — workspace props
        activeWorkspace={selectedWorkspace}
        onExitWorkspace={handleExitWorkspace}
        agents={agents}
        focusedAgentId={focusedAgentId}
        onFocusAgent={handleFocusAgent}
        onNewAgent={() => setShowNewAgentModal(true)}
        onRemoveAgent={handleRemoveAgent}
        onManageWorkspace={handleManageWorkspace}
        onManageAgent={handleManageAgent}
        activeWorkspaceConnected={Boolean(connection)}
        githubAuthenticated={githubAuthStatus?.authenticated ?? false}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setShowSettings(true)}
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
            onClose={() => setShowSettings(false)}
            runtime={runtime}
            githubAuthStatus={githubAuthStatus}
            onGitHubAuthChange={setGitHubAuthStatus}
            theme={theme}
            onToggleTheme={toggleTheme}
            chatDirectory={chatDirectory}
            onChatDirectoryChange={(dir) => void handleChatDirectoryChange(dir)}
          />
        )}

        {/* ── CHAT MODE ─────────────────────────────────────────── */}
        {!showSettings && interactionMode === "chat" && renderStandaloneChat()}

        {/* ── WORK MODE — home views ────────────────────────────── */}
        {!showSettings && interactionMode === "work" && !inWorkspace && workView === "workspaces" && (
          <div className="flex-1 flex flex-col overflow-y-auto scrollbar-thin" style={{ minHeight: 0 }}>
            <div className="mx-auto w-full max-w-5xl px-6 pt-5 pb-2">
              <ActivityChart agents={agents} />
            </div>
            <WorkspaceList
              workspaces={workspaces}
              onSelect={handleEnterWorkspace}
              onCreateNew={() => setShowCreateModal(true)}
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
            onSelectConversation={(id) => {
              setSelectedConversationId(id);
              setFocusedAgentId(id);
            }}
            onStartOpenCode={() => void handleStartOpenCode()}
            onStopOpenCode={() => void handleStopOpenCode()}
            onNewAgent={() => setShowNewAgentModal(true)}
            onFocusAgent={handleFocusAgent}
            onManageAgent={handleManageAgent}
            onWorkspaceBranchChange={handleWorkspaceBranchChange}
            loading={loadingWorkspace || focusedAgentIsProcessing}
            githubAuthStatus={githubAuthStatus}
            githubSlug={githubSlug}
            onNavigateToSettings={() => {
              setShowSettings(true);
            }}
            onGitHubSlugChange={setGitHubSlug}
          />
        )}

        {!showSettings && interactionMode === "work" && inWorkspace && focusedAgentId && renderAgentChat()}
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
          onCreateAgent={(branch, worktreePath, label) => void handleCreateAgentWithWorktree(branch, worktreePath, label)}
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
      {pendingQuestion && (
        <QuestionOverlay
          question={pendingQuestion}
          onAnswer={(answers) => void handleQuestionAnswer(answers)}
          onDismiss={handleQuestionDismiss}
        />
      )}
    </div>
  );
}
