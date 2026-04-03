import { useEffect, useRef, useState, useCallback } from "react";
import type {
  AgentStreamEvent,
  AppError,
  ChatMessage as StoredMessage,
  Conversation,
  CreateWorkspaceInput,
  OpenCodeConnection,
  OpenCodeModelOption,
  OpenCodeModelRef,
  ProcessOutput,
  RuntimeSummary,
  ThinkingStepData,
  Workspace,
} from "./lib/bindings";
import { commands, events } from "./lib/bindings";
import { initWebviewZoom } from "./lib/webview-zoom";
import { extractSessionId } from "./lib/ui";
import type { AgentInstance, AppMode, NavView } from "./lib/types";
import { createAgentInstance } from "./lib/types";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceView } from "./components/WorkspaceView";
import { WorkspaceList } from "./components/WorkspaceList";
import { ChatMessage, TypingIndicator } from "./components/ChatMessage";
import { ChatInput } from "./components/ChatInput";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { CreateWorkspaceModal } from "./components/CreateWorkspaceModal";
import { NewAgentModal } from "./components/NewAgentModal";
import { AgentSettingsModal } from "./components/AgentSettingsModal";

initWebviewZoom();

/* ─── Helpers ──────────────────────────────────────────────────────── */

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as AppError).message);
  }
  return "Something went wrong.";
}

function getModelSettingKey(workspaceId: string) {
  return `opencode:model:${workspaceId}`;
}

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

function applyStreamingStepEvent(prev: ThinkingStepData[], evt: AgentStreamEvent) {
  const metadata = evt.metadata ?? {};
  const stepId = typeof metadata.id === "string" ? metadata.id : null;
  if (!stepId) return prev;

  const title = typeof metadata.title === "string" ? metadata.title : "Working";
  const tool = typeof metadata.tool === "string" ? metadata.tool : undefined;
  const filename = typeof metadata.filename === "string" ? metadata.filename : undefined;
  const fileContent = typeof metadata.fileContent === "string" ? metadata.fileContent : undefined;
  const nextResult = typeof metadata.result === "string" ? metadata.result : undefined;
  const index = prev.findIndex((step) => step.id === stepId);
  const current = index >= 0 ? prev[index] : { id: stepId, title, status: "running" as const };
  const next: ThinkingStepData = {
    ...current,
    title,
    tool: tool ?? current.tool,
    filename: filename ?? current.filename,
    fileContent: fileContent ?? current.fileContent,
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
    next.status = "complete";
    if (evt.content) next.content = evt.content;
    if (nextResult) next.result = nextResult;
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

/* ─── App ──────────────────────────────────────────────────────────── */

export default function App() {
  // ── Mode & navigation ───────────────────────────────────────────
  const [appMode, setAppMode] = useState<AppMode>("home");
  const [currentView, setCurrentView] = useState<NavView>("workspaces");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNewAgentModal, setShowNewAgentModal] = useState(false);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [agentSettingsTarget, setAgentSettingsTarget] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSummary | null>(null);

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

  // ── Chat / streaming (for the focused agent) ────────────────────
  const [chatInput, setChatInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingSteps, setStreamingSteps] = useState<ThinkingStepData[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // ── Derived state ───────────────────────────────────────────────
  const activeConversation = conversations.find((item) => item.id === selectedConversationId) ?? null;
  const focusedAgent = agents.find((a) => a.id === focusedAgentId) ?? null;

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
      const [workspace, nextConversations, nextConnection, storedModelValue] = await Promise.all([
        commands.getWorkspace(workspaceId),
        commands.listConversations(workspaceId),
        commands.opencodeGetConnection(workspaceId),
        storedModelPromise,
      ]);

      const storedModel = parseStoredModel(storedModelValue);

      setSelectedWorkspace(workspace);
      setConversations(nextConversations);
      setConnection(nextConnection);
      setSelectedModel(storedModel);

      // Build agent instances from existing conversations
      const agentInstances = nextConversations.map((conv, i) =>
        createAgentInstance(
          conv.id,
          conv.title ?? `Agent ${i + 1}`,
          conv.backend_session_id ?? null,
          null,
        )
      );
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
    setMessages(nextMessages);
  }

  // ── Init ────────────────────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      try {
        const summary = await commands.getRuntimeSummary();
        setRuntime(summary);
        await refreshWorkspaces();
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
    if (!selectedWorkspaceId || !connection) {
      setAvailableModels([]);
      return;
    }

    let alive = true;
    void commands.opencodeListModels(selectedWorkspaceId)
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
  }, [connection, selectedWorkspaceId]);

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
  }, [messages, isProcessing]);

  const scrollToBottom = () => {
    const el = chatEndRef.current;
    if (!el) return;
    const scrollParent = el.closest("main");
    if (scrollParent) {
      scrollParent.scrollTop = scrollParent.scrollHeight;
    }
  };

  useEffect(() => {
    if ((messages.length > 0 || isProcessing) && isNearBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, isProcessing, streamingContent, streamingSteps]);

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
      if (info.workspace_id === selectedWorkspaceId) {
        void commands.opencodeGetConnection(info.workspace_id).then(setConnection).catch(() => undefined);
      }
    }).then((fn) => { unlistenReady = fn; });

    void events.onAgentStream((evt: AgentStreamEvent) => {
      if (!alive) return;
      if (evt.workspace_id !== selectedWorkspaceId) return;

      // Find which agent this event belongs to
      const targetAgentId = agents.find((a) => a.sessionId === evt.session_id)?.id;

      if (evt.event_type === "text_delta" && evt.content) {
        // Update focused agent's streaming content
        if (activeConversation?.backend_session_id && evt.session_id === activeConversation.backend_session_id) {
          setStreamingContent((prev) => prev + evt.content);
        }
        // Update agent card preview
        if (targetAgentId) {
          setAgents((prev) => prev.map((a) => {
            if (a.id !== targetAgentId) return a;
            const newContent = a.streamingContent + (evt.content ?? "");
            return {
              ...a,
              streamingContent: newContent,
              streamPreview: extractStreamPreview(newContent),
              status: "running" as const,
            };
          }));
        }
      } else if (evt.event_type === "step_start" || evt.event_type === "step_update" || evt.event_type === "step_complete") {
        if (activeConversation?.backend_session_id && evt.session_id === activeConversation.backend_session_id) {
          setStreamingSteps((prev) => applyStreamingStepEvent(prev, evt));
        }
        // Update agent card activity
        if (targetAgentId) {
          setAgents((prev) => prev.map((a) => {
            if (a.id !== targetAgentId) return a;
            const newSteps = applyStreamingStepEvent(a.streamingSteps, evt);
            return {
              ...a,
              streamingSteps: newSteps,
              currentActivity: deriveCurrentActivity(newSteps),
              status: "running" as const,
            };
          }));
        }
      } else if (evt.event_type === "done") {
        setIsProcessing(false);
        setStreamingContent("");
        setStreamingSteps([]);
        if (selectedConversationId) {
          void loadMessages(selectedConversationId).catch(() => {});
        }
        // Update agent card
        if (targetAgentId) {
          setAgents((prev) => prev.map((a) => {
            if (a.id !== targetAgentId) return a;
            return {
              ...a,
              status: "complete" as const,
              streamingContent: "",
              streamPreview: [],
              streamingSteps: [],
              currentActivity: null,
              finishedAt: new Date().toISOString(),
            };
          }));
        }
      } else if (evt.event_type === "error") {
        setIsProcessing(false);
        setStreamingContent("");
        setStreamingSteps([]);
        setError(evt.content ?? "Streaming error");
        if (targetAgentId) {
          setAgents((prev) => prev.map((a) => {
            if (a.id !== targetAgentId) return a;
            return {
              ...a,
              status: "error" as const,
              streamingContent: "",
              streamPreview: [],
              streamingSteps: [],
              currentActivity: null,
              errorMessage: evt.content ?? "Error",
              finishedAt: new Date().toISOString(),
            };
          }));
        }
      }
    }).then((fn) => { unlistenStream = fn; });

    return () => {
      alive = false;
      unlistenOutput?.();
      unlistenReady?.();
      unlistenStream?.();
    };
  }, [activeConversation?.backend_session_id, selectedConversationId, selectedWorkspaceId, agents]);

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
      setAppMode("workspace");
    } catch (error) {
      setError(getErrorMessage(error));
      throw error;
    } finally {
      setIsCreatingWorkspace(false);
    }
  }, []);

  const handleEnterWorkspace = useCallback((id: string) => {
    setSelectedWorkspaceId(id);
    setAppMode("workspace");
  }, []);

  const handleExitWorkspace = useCallback(() => {
    setAppMode("home");
    setCurrentView("workspaces");
    // Keep selectedWorkspaceId so sidebar can highlight it, but exit workspace mode
  }, []);

  const handleDeleteWorkspace = useCallback(async (id: string) => {
    try {
      // If we're deleting the currently-selected workspace, exit workspace mode
      if (id === selectedWorkspaceId) {
        setAppMode("home");
        setCurrentView("workspaces");
        setSelectedWorkspaceId(null);
      }
      await commands.deleteWorkspace(id);
      await refreshWorkspaces();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [selectedWorkspaceId]);

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

      // If in home mode, switch to workspace mode
      if (appMode === "home") {
        setAppMode("workspace");
      }

      return updatedConversation;
    } catch (error) {
      setError(getErrorMessage(error));
      return null;
    }
  }

  async function handleChatSend() {
    if (!selectedWorkspace || !chatInput.trim()) return;

    let conversation = activeConversation;
    if (!conversation) {
      conversation = await handleNewConversation();
    }
    if (!conversation?.backend_session_id) {
      setError("Create a conversation before sending a message.");
      return;
    }

    const content = chatInput.trim();
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
    }

    setChatInput("");
    setIsProcessing(true);
    setStreamingContent("");
    setStreamingSteps([]);
    setError(null);

    // Mark agent as running
    if (focusedAgentId) {
      setAgents((prev) => prev.map((a) => {
        if (a.id !== focusedAgentId) return a;
        return { ...a, status: "running", startedAt: new Date().toISOString(), streamingContent: "", streamPreview: [], streamingSteps: [], currentActivity: "Starting..." };
      }));
    }

    try {
      await commands.opencodeSendStreaming(
        selectedWorkspace.id,
        conversation.backend_session_id,
        conversation.id,
        content,
        modelForSend,
      );
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
      await commands.opencodeAbort(selectedWorkspace.id, activeConversation.backend_session_id);
      setIsProcessing(false);
      setStreamingSteps([]);
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
      await commands.opencodeAbort(selectedWorkspace.id, agent.sessionId).catch(() => {});
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

      if (appMode === "home") {
        setAppMode("workspace");
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsCreatingAgent(false);
    }
  }, [selectedWorkspace, appMode, selectedModelOption]);

  /** Show workspace overview (unfocus any agent) */
  const handleManageWorkspace = useCallback(() => {
    setFocusedAgentId(null);
    setSelectedConversationId(null);
  }, []);

  /** Open the agent settings modal */
  const handleManageAgent = useCallback((agentId: string) => {
    setAgentSettingsTarget(agentId);
  }, []);

  // ── Render helpers ──────────────────────────────────────────────

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
              className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            >
              New
            </button>
          </div>
        </div>

        {/* Messages area */}
        <main
          className={`min-h-0 flex-1 overflow-y-auto scrollbar-thin ${
            messages.length === 0 && !isProcessing
              ? "px-0 py-6"
              : "px-4 pb-36 pt-3 sm:pb-44 md:px-6 md:pb-52 md:pt-6"
          }`}
        >
          {messages.length === 0 && !isProcessing ? (
            <WelcomeScreen
              input={chatInput}
              setInput={setChatInput}
              onSend={() => void handleChatSend()}
              hideInput
            />
          ) : (
            <div className="mx-auto max-w-3xl">
              <div className="rounded-2xl p-5 glass-card-static">
                <div className="space-y-5">
                  {messages.map((msg) => (
                    <ChatMessage key={msg.id} message={msg} />
                  ))}
                  {isProcessing && (streamingContent || streamingSteps.length > 0) && (
                    <ChatMessage
                      message={{
                        id: "__streaming__",
                        conversation_id: selectedConversationId ?? "",
                        role: "assistant",
                        content: streamingContent,
                        metadata: null,
                        created_at: new Date().toISOString(),
                        thinkingSteps: streamingSteps,
                      }}
                      isStreaming
                    />
                  )}
                  {isProcessing && !streamingContent && streamingSteps.length === 0 && <TypingIndicator />}
                  <div ref={chatEndRef} />
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
              value={chatInput}
              onChange={setChatInput}
              onSend={() => void handleChatSend()}
              onStop={() => void handleAbort()}
              isProcessing={isProcessing}
              availableModels={availableModels}
              selectedModelKey={selectedModel ? getModelKey(selectedModel) : null}
              onSelectModel={(key) => void handleSelectModel(key)}
              modelDisabled={isProcessing}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────

  return (
    <div className="glass-page-shell flex h-full max-h-full overflow-hidden">
      <Sidebar
        appMode={appMode}
        // Home mode props
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelectWorkspace={handleEnterWorkspace}
        currentView={currentView}
        onNavigate={setCurrentView}
        onNewWorkspace={() => setShowCreateModal(true)}
        // Workspace mode props
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
      />

      <div className="relative z-10 flex flex-col overflow-hidden" style={{ flex: "1 1 0%", minWidth: 0, minHeight: 0 }}>
        {/* Error banner */}
        {error && (
          <div className="shrink-0 px-6 pt-4">
            <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg-strong)] px-4 py-3 text-[12px] text-[var(--color-danger-text)] flex items-center justify-between gap-3">
              <span>{error}</span>
              <button className="font-semibold" onClick={() => setError(null)}>Dismiss</button>
            </div>
          </div>
        )}

        {/* ── HOME MODE ─────────────────────────────────────────── */}
        {appMode === "home" && currentView === "workspaces" && (
          <WorkspaceList
            workspaces={workspaces}
            onSelect={handleEnterWorkspace}
            onCreateNew={() => setShowCreateModal(true)}
            onDelete={(id) => void handleDeleteWorkspace(id)}
          />
        )}

        {appMode === "home" && currentView === "chat" && renderAgentChat()}

        {appMode === "home" && currentView === "settings" && (
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-8" style={{ minHeight: 0 }}>
            <div className="mx-auto max-w-2xl">
              <h1 className="text-xl font-bold text-[var(--text-primary)] mb-6">Settings</h1>
              <div className="rounded-xl glass-card-static p-5">
                <p className="text-sm text-[var(--text-muted)]">Runtime: {runtime?.runtime ?? "loading"}</p>
                <p className="text-sm text-[var(--text-muted)] mt-2">Platform: {runtime?.platform ?? "loading"}</p>
                <p className="text-sm text-[var(--text-muted)] mt-2">OpenCode available: {runtime?.opencode_available ? "yes" : "unknown"}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── WORKSPACE MODE ────────────────────────────────────── */}
        {appMode === "workspace" && !focusedAgentId && selectedWorkspace && (
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
            loading={loadingWorkspace || isProcessing}
          />
        )}

        {appMode === "workspace" && focusedAgentId && renderAgentChat()}
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
    </div>
  );
}
