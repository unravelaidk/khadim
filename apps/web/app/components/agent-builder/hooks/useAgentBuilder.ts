import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { hc } from "hono/client";
import { useNavigate } from "react-router";
import type { AgentConfig, Message, PendingQuestion, ThinkingStepData } from "../../../types/chat";
import type { SlideTemplate, SlideTheme } from "../../../types/slides";
import type { AttachedFile } from "../WelcomeScreen";
import type { ModelOption } from "../ModelSelector";
import { agentMessages, showError } from "../../../lib/toast";
import { callAgentRpc } from "../../../lib/agent-rpc-client";
import type { AgentWsAppType } from "../../../lib/agent-ws";
import {
  appendMessages,
  applyJobSnapshot,
  applyLoadedChat,
  applySessionSnapshot,
  applyStreamEvent as applySessionStreamEvent,
  bindJobToMessage,
  createEmptyAgentSessionState,
  DRAFT_CHAT_KEY,
  getChatStateKey,
  registerPendingAssistantMessage,
  replaceChatKey,
  resetDraftChat,
  resolvePendingAssistantMessage,
  selectChatRuntime,
  selectSlideRuntime,
  setChatMeta,
  setJobActive,
  updateMessageById,
  type ActiveAgentState,
  type JobSnapshot,
  type SessionSnapshotEvent,
  type StreamEvent,
  type AgentSessionState,
} from "./agent-session-state";

export type ActiveBadge = {
  label: string;
  icon: ReactNode;
  prompt?: string;
  isPremade?: boolean;
  templateInfo?: { template: SlideTemplate; theme: SlideTheme };
  slideCount?: number;
};

interface UseAgentBuilderOptions {
  initialChatId?: string;
  initialView?: "chat" | "workspace";
  initialWorkspaceId?: string | null;
}

export interface AgentBuilderState {
  messages: Message[];
  slideState: { content: string | null; isStreaming: boolean; isBuilding: boolean } | null;
  input: string;
  isTyping: boolean;
  agentConfig: AgentConfig | null;
  showPreview: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  activeBadges: ActiveBadge[];
  sandboxId: string | null;
  chatId: string | null;
  selectedWorkspaceId: string | null;
  jobId: string | null;
  sidebarRefreshKey: number;
  isProcessing: boolean;
  activeAgent: { mode: "plan" | "build"; name: string } | null;
  pendingQuestion: PendingQuestion | null;
  currentView: "chat" | "workspace" | "settings";
  isSidebarOpen: boolean;
  attachedFiles: AttachedFile[];
  isInitialState: boolean;
  availableModels: ModelOption[];
  selectedModelId: string | null;
  isModelLoading: boolean;
  isModelUpdating: boolean;
  webBrowsingEnabled: boolean;
}

export interface AgentBuilderActions {
  setInput: (value: string) => void;
  setShowPreview: (value: boolean) => void;
  setIsSidebarOpen: (value: boolean) => void;
  setAttachedFiles: (files: AttachedFile[]) => void;
  handleNavigate: (view: "chat" | "workspace" | "settings") => void;
  handleSelectChat: (selectedChatId: string | null) => Promise<void>;
  handleNewChat: () => void;
  handleSelectWorkspace: (workspaceId: string | null) => void;
  handleOpenWorkspace: () => void;
  handleCreateChatInWorkspace: () => Promise<void>;
  handleSend: () => Promise<void>;
  handleStop: () => void;
  handleAnswerQuestion: (answer: string) => Promise<void>;
  handleSuggestionClick: (feature: ActiveBadge) => void;
  removeBadge: (label: string) => void;
  updateSlideCount: (label: string, count: number) => void;
  removeAttachedFile: (fileName: string) => void;
  clearPendingQuestion: () => void;
  handleSelectModel: (modelId: string) => Promise<void>;
  setWebBrowsingEnabled: (enabled: boolean) => void;
}

interface ModelsApiResponse {
  models?: Array<{
    id: string;
    name: string;
    provider: ModelOption["provider"];
    model: string;
    isActive?: boolean | null;
  }>;
  error?: string;
}

interface UploadedDocumentResponse {
  document?: {
    id: string;
    filename: string;
    mimeType: string | null;
    size: number;
    pageCount: number | null;
    parseStatus: string;
  };
  error?: string;
}

export function useAgentBuilder({ initialChatId, initialView = "chat", initialWorkspaceId = null }: UseAgentBuilderOptions) {
  const wsClient = typeof window === "undefined" ? null : hc<AgentWsAppType>(window.location.origin);
  const getClientSessionId = () => {
    if (typeof window === "undefined") return "default";

    const storageKey = "khadim-agent-session-id";
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;

    const sessionId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(storageKey, sessionId);
    return sessionId;
  };

  const navigate = useNavigate();
  const [sessionState, setSessionState] = useState<AgentSessionState>(createEmptyAgentSessionState());
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeBadges, setActiveBadges] = useState<ActiveBadge[]>([]);
  const [chatId, setChatId] = useState<string | null>(initialChatId || null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(initialWorkspaceId);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const sessionIdRef = useRef<string>(getClientSessionId());
  const currentChatIdRef = useRef<string | null>(initialChatId || null);
  const initialLoadRef = useRef(false);
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const socketReconnectTimeoutRef = useRef<number | null>(null);
  const socketHeartbeatIntervalRef = useRef<number | null>(null);
  const lastStreamEventIdRef = useRef<string | null>(null);
  const lastPongAtRef = useRef<number>(Date.now());
  const reconnectAttemptRef = useRef(0);
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  const pendingSocketCommandRef = useRef<{
    resolve: (value: { jobId: string; chatId: string; sessionId: string }) => void;
    reject: (error: Error) => void;
    timeoutId: number;
  } | null>(null);

  const [currentView, setCurrentView] = useState<"chat" | "workspace" | "settings">(initialView);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isModelUpdating, setIsModelUpdating] = useState(false);
  const [webBrowsingEnabled, setWebBrowsingEnabled] = useState(true);

  const currentChatKey = getChatStateKey(chatId);
  const currentChatState = selectChatRuntime(sessionState, chatId);
  const messages = currentChatState.messages;
  const sandboxId = currentChatState.sandboxId;
  const pendingQuestion = currentChatState.pendingQuestion;
  const activeAgent = currentChatState.activeAgent;
  const activeJobIds = currentChatState.activeJobIds;
  const jobId = activeJobIds[activeJobIds.length - 1] || null;
  const isProcessing = activeJobIds.length > 0;
  const slideState = selectSlideRuntime(sessionState, chatId, isProcessing);

  const removeAttachedFile = (fileName: string) => {
    setAttachedFiles((prev) => prev.filter((file) => file.name !== fileName));
  };

  const fetchAvailableModels = async () => {
    setIsModelLoading(true);
    try {
      const response = await fetch("/api/models");
      const payload = (await response.json()) as ModelsApiResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load models");
      }

      const mapped = (payload.models || []).map((model) => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        model: model.model,
        isActive: model.isActive,
      }));

      setAvailableModels(mapped);
      const active = mapped.find((model) => model.isActive);
      setSelectedModelId((previous) => {
        if (previous && mapped.some((model) => model.id === previous)) {
          return previous;
        }
        return active?.id || mapped[0]?.id || null;
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to load models");
      setAvailableModels([]);
      setSelectedModelId(null);
    } finally {
      setIsModelLoading(false);
    }
  };

  const handleSelectModel = async (modelId: string) => {
    if (!modelId || modelId === selectedModelId) return;

    const previousModelId = selectedModelId;
    setSelectedModelId(modelId);
    setIsModelUpdating(true);

    try {
      const body = new FormData();
      body.append("intent", "setActive");
      body.append("id", modelId);

      const response = await fetch("/api/models", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update active model");
      }

      setAvailableModels((previous) =>
        previous.map((model) => ({
          ...model,
          isActive: model.id === modelId,
        }))
      );
    } catch (error) {
      setSelectedModelId(previousModelId);
      showError(error instanceof Error ? error.message : "Failed to update active model");
    } finally {
      setIsModelUpdating(false);
    }
  };

  const applyStreamEvent = (event: StreamEvent) => {
    setSessionState((prev) => applySessionStreamEvent(prev, event));

    const eventChatId = typeof event.chatId === "string" ? event.chatId : null;
    const shouldAffectCurrentChat = !eventChatId || eventChatId === currentChatIdRef.current;

    if (shouldAffectCurrentChat && (event.type === "ask_user" || event.type === "done" || event.type === "error")) {
      setIsTyping(false);
    }

    if (event.type === "delegate_build") {
      const buildPrompt = `Execute this approved plan:\n\n${event.plan as string}${event.context ? `\n\nContext: ${event.context as string}` : ""}`;
      setInput(buildPrompt);
    }
  };

  const sendSessionCommand = (
    command: "job.followUp" | "job.steer",
    prompt: string,
    options: { chatId?: string; jobId?: string } = {},
  ) => {
    const socket = sessionSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Session socket is not connected"));
    }

    if (pendingSocketCommandRef.current) {
      return Promise.reject(new Error("Another session command is already pending"));
    }

    return new Promise<{ jobId: string; chatId: string; sessionId: string }>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        if (!pendingSocketCommandRef.current) {
          return;
        }
        pendingSocketCommandRef.current = null;
        reject(new Error("Session command timed out"));
      }, 15000);

      pendingSocketCommandRef.current = { resolve, reject, timeoutId };
      socket.send(JSON.stringify({ type: command, prompt, chatId: options.chatId, jobId: options.jobId }));
    });
  };

  const appendChatMessages = (chatKey: string, nextMessages: Message[]) => {
    setSessionState((prev) => appendMessages(prev, chatKey, nextMessages));
  };

  const patchMessage = (chatKey: string, messageId: string, updater: (message: Message) => Message) => {
    setSessionState((prev) => updateMessageById(prev, chatKey, messageId, updater));
  };

  const queuePendingAssistant = (chatKey: string, messageId: string) => {
    setSessionState((prev) => registerPendingAssistantMessage(prev, chatKey, messageId));
  };

  const clearPendingAssistant = (chatKey: string, messageId: string) => {
    setSessionState((prev) => resolvePendingAssistantMessage(prev, chatKey, messageId));
  };

  const renameChatStateKey = (fromKey: string, toKey: string) => {
    setSessionState((prev) => replaceChatKey(prev, fromKey, toKey));
  };

  const loadChatState = (nextChatId: string, nextMessages: Message[], nextSandboxId: string | null) => {
    setSessionState((prev) => applyLoadedChat(prev, nextChatId, nextMessages, nextSandboxId));
  };

  const activateJob = (nextJobId: string, nextChatId: string, active: boolean) => {
    setSessionState((prev) => setJobActive(prev, nextJobId, nextChatId, active));
  };

  const attachJobToMessage = (nextJobId: string, nextChatId: string, messageId: string) => {
    setSessionState((prev) => bindJobToMessage(prev, nextJobId, nextChatId, messageId));
  };

  const clearPendingQuestionForChat = (chatKey: string) => {
    setSessionState((prev) => setChatMeta(prev, chatKey, { pendingQuestion: null }));
  };

  const formatAttachmentSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const buildAttachmentContext = (files: AttachedFile[]) => {
    const MAX_CONTENT_CHARS = 4000;
    const promptFiles = files.filter((file) => !!file.content);
    if (promptFiles.length === 0) return "";

    return promptFiles
      .map((file) => {
        const content = file.content ? file.content.slice(0, MAX_CONTENT_CHARS) : "";
        const isTruncated = !!file.content && file.content.length > MAX_CONTENT_CHARS;
        const contentLabel = file.type.startsWith("image/") || content.startsWith("data:")
          ? "Data URL"
          : "Content";

        return [
          `Name: ${file.name}`,
          `Type: ${file.type || "unknown"}`,
          `Size: ${formatAttachmentSize(file.size)}`,
          content
            ? `${contentLabel}:
${content}${isTruncated ? "\n...[truncated]" : ""}`
            : "Content: (empty)",
        ].join("\n");
      })
      .join("\n\n---\n\n");
  };

  const uploadAttachedDocuments = async ({
    files,
    chatId,
    workspaceId,
  }: {
    files: AttachedFile[];
    chatId: string;
    workspaceId?: string | null;
  }) => {
    const uploadableFiles = files.filter((file) => file.file && !file.type.startsWith("image/"));
    if (uploadableFiles.length === 0) return [] as string[];

    const results = await Promise.all(
      uploadableFiles.map(async (file) => {
        const body = new FormData();
        body.append("file", file.file as File);
        body.append("chatId", chatId);
        if (workspaceId) {
          body.append("workspaceId", workspaceId);
        }

        const response = await fetch("/api/documents/upload", {
          method: "POST",
          body,
        });
        const payload = (await response.json()) as UploadedDocumentResponse;
        if (!response.ok || !payload.document) {
          throw new Error(payload.error || `Failed to upload ${file.name}`);
        }

        return payload.document.id;
      })
    );

    return results;
  };

  const generateTitle = (prompt: string): string => {
    let title = prompt
      .replace(/^(build|create|make|write|design|implement|help me|i want|can you)\s+(a|an|the|me)?\s*/i, "")
      .replace(/^(with|using|that|for)\s+/i, "");

    const words = title.split(/\s+/).slice(0, 4);
    title = words.join(" ");

    title = title.charAt(0).toUpperCase() + title.slice(1);

    if (title.length > 30) {
      title = title.slice(0, 30).trim() + "...";
    }

    return title || "New Chat";
  };

  const handleSelectChat = async (selectedChatId: string | null) => {
    if (!selectedChatId) {
      handleNewChat();
      return;
    }

    if (selectedChatId !== initialChatId) {
      navigate(`/agent/${selectedChatId}`);
    }

    try {
      const response = await fetch(`/api/chats/${selectedChatId}`);
      if (!response.ok) return;

      const { chat } = await response.json();
      setChatId(chat.id);
      setSelectedWorkspaceId(chat.workspaceId || null);

      const loadedMessages: Message[] = chat.messages.map((msg: any) => {
        let fileContent: string | undefined;
        const indexHtml = chat.artifacts?.find((artifact: any) => artifact.filename === "index.html");
        const isSlideContent = indexHtml?.content?.includes('<script id="slide-data"');

        if (indexHtml && (msg.previewUrl || isSlideContent)) {
          fileContent = indexHtml.content;
        }

        return {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.createdAt),
          previewUrl: msg.previewUrl ? "loading" : undefined,
          fileContent,
          thinkingSteps: msg.thinkingSteps,
        };
      });

      loadChatState(chat.id, loadedMessages, chat.sandboxId || null);
      setCurrentView("chat");

      const hasPreviewContent =
        loadedMessages.some((msg) => msg.previewUrl) ||
        chat.artifacts?.some((artifact: any) => artifact.filename === "index.html");

      if (hasPreviewContent && chat.sandboxId) {
        const sandboxForm = new FormData();
        sandboxForm.append("sandboxId", chat.sandboxId);
        sandboxForm.append("chatId", chat.id);

        const sandboxRes = await fetch("/api/sandbox/connect", {
          method: "POST",
          body: sandboxForm,
        });

        if (sandboxRes.ok) {
          const { sandboxId: newSandboxId, previewUrl: newPreviewUrl } = await sandboxRes.json();
          setSessionState((prev) => setChatMeta(prev, chat.id, { sandboxId: newSandboxId }));

          if (newPreviewUrl) {
            for (const message of loadedMessages) {
              if (!message.previewUrl) continue;
              patchMessage(chat.id, message.id, (existingMessage) => ({ ...existingMessage, previewUrl: newPreviewUrl }));
            }
          }
        }
      }

      try {
        const payload = await callAgentRpc("chat.getActiveJobs", {
          chatId: chat.id,
          sessionId: sessionIdRef.current,
        });
        for (const activeJob of payload.jobs || []) {
          setSessionState((prev) => applyJobSnapshot(prev, activeJob));
          if (activeJob.status === "running") {
            setIsTyping(true);
          }
        }
      } catch (error) {
        console.log("No active job to resume or error checking:", error);
      }
    } catch (error) {
      console.error("Failed to load chat:", error);
      showError("Failed to load chat. Please try again.");
    }
  };

  const handleNewChat = () => {
    setChatId(null);
    setSessionState((prev) => resetDraftChat(prev));
    setActiveBadges([]);
    setCurrentView("chat");
    initialLoadRef.current = false;
    navigate("/");
  };

  const handleSelectWorkspace = (workspaceId: string | null) => {
    setSelectedWorkspaceId(workspaceId);
    setCurrentView("workspace");
    navigate(workspaceId ? `/workspace/${workspaceId}` : "/workspace");
  };

  const deriveWorkspaceName = () => {
    const firstUserMessage = messages.find((message) => message.role === "user" && message.content.trim().length > 0);
    if (firstUserMessage) {
      return generateTitle(firstUserMessage.content).replace(/\.\.\.$/, "") + " Workspace";
    }
    return "New Workspace";
  };

  const createWorkspace = async (sourceChatId?: string | null) => {
    const formData = new FormData();
    formData.append("name", deriveWorkspaceName());
    formData.append("agentId", activeAgent?.mode || "build");
    if (sourceChatId) {
      formData.append("chatId", sourceChatId);
    }

    const response = await fetch("/api/workspaces", { method: "POST", body: formData });
    if (!response.ok) {
      throw new Error("Failed to create workspace");
    }

    const { workspace } = await response.json();
    setSelectedWorkspaceId(workspace.id);
    return workspace as { id: string };
  };

  const handleOpenWorkspace = async () => {
    try {
      if (selectedWorkspaceId) {
        setCurrentView("workspace");
        navigate(`/workspace/${selectedWorkspaceId}`);
        return;
      }

      const workspace = await createWorkspace(chatId);
      setCurrentView("workspace");
      navigate(`/workspace/${workspace.id}`);
    } catch (error) {
      showError("Failed to open workspace. Please try again.");
    }
  };

  const handleCreateChatInWorkspace = async () => {
    if (!selectedWorkspaceId) {
      handleNewChat();
      return;
    }

    const formData = new FormData();
    formData.append("title", "New Chat");
    formData.append("workspaceId", selectedWorkspaceId);

    const response = await fetch("/api/chats", { method: "POST", body: formData });
    if (!response.ok) {
      showError("Failed to create workspace chat. Please try again.");
      return;
    }

    const { chat } = await response.json();
    setSidebarRefreshKey((prev) => prev + 1);
    await handleSelectChat(chat.id);
  };

  const handleNavigate = (view: "chat" | "workspace" | "settings") => {
    setCurrentView(view);

    if (view === "chat") {
      navigate(chatId ? `/agent/${chatId}` : "/");
      return;
    }

    if (view === "workspace") {
      navigate(selectedWorkspaceId ? `/workspace/${selectedWorkspaceId}` : "/workspace");
    }
  };

  // Track whether the user is near the bottom of the chat scroll container.
  // When true, new streaming chunks auto-scroll; when the user scrolls up we
  // leave them in place so they can read history.
  const isNearBottomRef = useRef(true);

  // Attach a scroll listener to <main> once it exists so we can track position.
  useEffect(() => {
    const el = messagesEndRef.current;
    if (!el) return;
    const scrollParent = el.closest('main');
    if (!scrollParent) return;

    const handleScroll = () => {
      const threshold = 120; // px from bottom considered "near bottom"
      const { scrollTop, scrollHeight, clientHeight } = scrollParent;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < threshold;
    };

    scrollParent.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollParent.removeEventListener('scroll', handleScroll);
  }, [messagesEndRef]);

  const scrollToBottom = () => {
    const el = messagesEndRef.current;
    if (!el) return;
    // Scroll only the nearest scrollable parent (<main>), not the whole page
    const scrollParent = el.closest('main');
    if (scrollParent) {
      scrollParent.scrollTop = scrollParent.scrollHeight;
    }
  };

  useEffect(() => {
    currentChatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    if (currentView === "chat" && isNearBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, currentView]);

  useEffect(() => {
    if (initialChatId && !initialLoadRef.current) {
      initialLoadRef.current = true;
      handleSelectChat(initialChatId);
    }
  }, [initialChatId]);

  useEffect(() => {
    if (currentView === "chat") {
      void fetchAvailableModels();
    }
  }, [currentView]);

  useEffect(() => {
    const sessionId = sessionIdRef.current;
    let disposed = false;

    const clearSocketTimers = () => {
      if (socketReconnectTimeoutRef.current !== null) {
        window.clearTimeout(socketReconnectTimeoutRef.current);
        socketReconnectTimeoutRef.current = null;
      }

      if (socketHeartbeatIntervalRef.current !== null) {
        window.clearInterval(socketHeartbeatIntervalRef.current);
        socketHeartbeatIntervalRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) {
        return;
      }

      if (socketReconnectTimeoutRef.current !== null) {
        return;
      }

      const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 10000);
      reconnectAttemptRef.current += 1;
      socketReconnectTimeoutRef.current = window.setTimeout(() => {
        socketReconnectTimeoutRef.current = null;
        connectSessionSocket();
      }, delay);
    };

    const connectSessionSocket = () => {
      const socket = wsClient?.api.agent.ws.$ws();
      if (!socket) {
        return;
      }
      sessionSocketRef.current = socket;
      lastPongAtRef.current = Date.now();

      socket.addEventListener("open", () => {
        reconnectAttemptRef.current = 0;
        socket.send(
          JSON.stringify({
            type: "session.connect",
            sessionId,
            lastEventId: lastStreamEventIdRef.current,
          }),
        );

        clearSocketTimers();
        socketHeartbeatIntervalRef.current = window.setInterval(() => {
          if (Date.now() - lastPongAtRef.current > 60000) {
            socket.close();
            return;
          }

          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);
      });

      socket.addEventListener("message", (messageEvent) => {
        try {
          const event = JSON.parse(String(messageEvent.data)) as StreamEvent;
          if (event.type === "pong") {
            lastPongAtRef.current = Date.now();
            return;
          }

          if (event.type === "command_accepted") {
            if (pendingSocketCommandRef.current) {
              window.clearTimeout(pendingSocketCommandRef.current.timeoutId);
              pendingSocketCommandRef.current.resolve({
                jobId: String((event as any).jobId || ""),
                chatId: String((event as any).chatId || ""),
                sessionId: String((event as any).sessionId || sessionId),
              });
              pendingSocketCommandRef.current = null;
            }
            return;
          }

          if (event.type === "error" && pendingSocketCommandRef.current) {
            window.clearTimeout(pendingSocketCommandRef.current.timeoutId);
            pendingSocketCommandRef.current.reject(
              new Error(typeof (event as any).error === "string" ? (event as any).error : "Session command failed"),
            );
            pendingSocketCommandRef.current = null;
            return;
          }

          if (typeof event.eventId === "string") {
            lastStreamEventIdRef.current = event.eventId;
          } else if (typeof event.snapshotEventId === "string") {
            lastStreamEventIdRef.current = event.snapshotEventId;
          }

          applyStreamEvent(event);
        } catch (error) {
          console.error("Failed to parse session stream event:", error);
        }
      });

      socket.addEventListener("close", () => {
        clearSocketTimers();
        if (sessionSocketRef.current === socket) {
          sessionSocketRef.current = null;
        }
        if (pendingSocketCommandRef.current) {
          window.clearTimeout(pendingSocketCommandRef.current.timeoutId);
          pendingSocketCommandRef.current.reject(new Error("Session socket closed"));
          pendingSocketCommandRef.current = null;
        }
        scheduleReconnect();
      });

      socket.addEventListener("error", (error) => {
        console.error("Session stream error:", error);
      });
    };

    connectSessionSocket();

    return () => {
      disposed = true;
      clearSocketTimers();
      const socket = sessionSocketRef.current;
      sessionSocketRef.current = null;
      if (socket) {
        socket.close();
      }
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() && attachedFiles.length === 0) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim() || "(Attached files)",
      timestamp: new Date(),
    };

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      thinkingSteps: [],
    };

    const inlineAttachmentContext = buildAttachmentContext(attachedFiles);
    const promptWithAttachments = inlineAttachmentContext
      ? `${userMessage.content}\n\nAttached files:\n${inlineAttachmentContext}`
      : userMessage.content;

    const draftChatKey = getChatStateKey(chatId);
    queuePendingAssistant(draftChatKey, assistantMessageId);
    appendChatMessages(draftChatKey, [userMessage, assistantMessage]);
    setInput("");
    setAttachedFiles([]);
    setIsTyping(true);

    const abortController = new AbortController();
    requestAbortControllerRef.current = abortController;
    let currentChatId = chatId;

    try {
      if (!currentChatId) {
        const createChatForm = new FormData();
        createChatForm.append("title", generateTitle(userMessage.content));
        if (selectedWorkspaceId) {
          createChatForm.append("workspaceId", selectedWorkspaceId);
        }
        const chatResponse = await fetch("/api/chats", {
          method: "POST",
          body: createChatForm,
        });
        if (chatResponse.ok) {
          const { chat } = await chatResponse.json();
          currentChatId = chat.id;
          const nextChatKey = getChatStateKey(chat.id);
          clearPendingAssistant(draftChatKey, assistantMessageId);
          queuePendingAssistant(nextChatKey, assistantMessageId);
          renameChatStateKey(DRAFT_CHAT_KEY, chat.id);
          setChatId(chat.id);
          setSelectedWorkspaceId(chat.workspaceId || selectedWorkspaceId || null);
          setSidebarRefreshKey((prev) => prev + 1);
          navigate(`/agent/${chat.id}`, { replace: true });
        }
      }

      const uploadedDocumentIds = currentChatId
        ? await uploadAttachedDocuments({
            files: attachedFiles,
            chatId: currentChatId,
            workspaceId: selectedWorkspaceId,
          })
        : [];

      const createUserMessageRequest = currentChatId
        ? () => {
            const chatIdForUserMessage = currentChatId as string;
            const userMsgForm = new FormData();
            userMsgForm.append("chatId", chatIdForUserMessage);
            userMsgForm.append("role", "user");
            userMsgForm.append("content", userMessage.content);
            return fetch("/api/messages", { method: "POST", body: userMsgForm });
          }
        : null;

      const submitAgentRequest = async () => {
        if (currentChatId) {
          try {
            return await sendSessionCommand("job.followUp", promptWithAttachments, {
              chatId: currentChatId,
              jobId: jobId || undefined,
            });
          } catch (error) {
            if (!(error instanceof Error) || (!error.message.includes("No live session host found") && !error.message.includes("Session socket"))) {
              throw error;
            }
          }

          try {
            return await callAgentRpc("job.followUp", {
              jobId: jobId || undefined,
              chatId: currentChatId,
              sessionId: sessionIdRef.current,
              prompt: promptWithAttachments,
            }, { signal: abortController.signal });
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes("No live session host found")) {
              throw error;
            }
          }
        }

        return callAgentRpc("job.start", {
          prompt: promptWithAttachments,
          sandboxId: sandboxId || undefined,
          chatId: currentChatId || undefined,
          sessionId: sessionIdRef.current,
          badges: activeBadges.length > 0 ? JSON.stringify(activeBadges) : undefined,
          documentIds: uploadedDocumentIds,
        }, { signal: abortController.signal });
      };

      const [payload] = await Promise.all([
        submitAgentRequest(),
        createUserMessageRequest?.(),
      ]);
      if (!payload.jobId || !payload.chatId) {
        throw new Error("Missing job metadata");
      }

      attachJobToMessage(payload.jobId, payload.chatId, assistantMessageId);
      activateJob(payload.jobId, payload.chatId, true);
    } catch (error) {
      clearPendingAssistant(getChatStateKey(currentChatId || chatId), assistantMessageId);
      if (error instanceof Error && (error.name === "AbortError" || error.message.includes("Cancelled by user"))) {
        patchMessage(getChatStateKey(chatId), assistantMessageId, (message) => ({ ...message, content: "⏹️ Request stopped by user." }));
        agentMessages.cancelled();
      } else {
        patchMessage(getChatStateKey(chatId), assistantMessageId, (message) => ({
          ...message,
          content: "Sorry, I encountered an error connecting to the agent. Please check your API key and try again.",
        }));
        agentMessages.failed(error instanceof Error ? error.message : undefined);
      }
    } finally {
      requestAbortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (requestAbortControllerRef.current) {
      requestAbortControllerRef.current.abort();
    }
    setIsTyping(false);
    if (jobId && chatId) {
      void callAgentRpc("job.stop", {
        jobId,
        chatId,
        sessionId: sessionIdRef.current,
      });
    }
    requestAbortControllerRef.current = null;
  };

  const handleAnswerQuestion = async (answer: string) => {
    if (!pendingQuestion) return;

    clearPendingQuestionForChat(getChatStateKey(chatId));

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: answer,
      timestamp: new Date(),
    };

    appendChatMessages(getChatStateKey(chatId), [userMessage]);

    const saveUserMessage = chatId
      ? () => {
          const userMsgForm = new FormData();
          userMsgForm.append("chatId", chatId);
          userMsgForm.append("role", "user");
          userMsgForm.append("content", answer);
          return fetch("/api/messages", { method: "POST", body: userMsgForm });
        }
      : null;

    setInput("");

    const contextualPrompt = `User answered the question: "${pendingQuestion.question}"\n\nAnswer: ${answer}${pendingQuestion.context ? `\n\nOriginal context: ${pendingQuestion.context}` : ""}`;
    const planPrefix = "Plan:\n";
    const planFromContext = pendingQuestion.context?.startsWith(planPrefix)
      ? pendingQuestion.context.slice(planPrefix.length)
      : null;
    const normalizedAnswer = answer.trim().toLowerCase();
    const isApproval =
      normalizedAnswer === "yes" ||
      normalizedAnswer.startsWith("yes,") ||
      normalizedAnswer === "y" ||
      normalizedAnswer === "ok" ||
      normalizedAnswer === "okay" ||
      normalizedAnswer === "sure";
    let nextPrompt = contextualPrompt;
    let nextMode: "plan" | "build" = activeAgent?.mode ?? "build";

    if (planFromContext) {
      if (isApproval) {
        nextPrompt = `Execute this approved plan:\n\n${planFromContext}`;
        nextMode = "build";
      } else {
        nextPrompt = `Update the plan based on this feedback:\n\n${answer}\n\nExisting plan:\n${planFromContext}`;
        nextMode = "plan";
      }
    }

    setIsTyping(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      thinkingSteps: [],
    };

    appendChatMessages(getChatStateKey(chatId), [assistantMessage]);
    queuePendingAssistant(getChatStateKey(chatId), assistantMessageId);

    try {
      const [payload] = await Promise.all([
        callAgentRpc("job.start", {
          prompt: nextPrompt,
          agentMode: nextMode,
          sandboxId: sandboxId || undefined,
          chatId: chatId || undefined,
          sessionId: sessionIdRef.current,
        }),
        saveUserMessage?.(),
      ]);
      if (!payload.jobId || !payload.chatId) {
        throw new Error("Missing job metadata");
      }

      attachJobToMessage(payload.jobId, payload.chatId, assistantMessageId);
      activateJob(payload.jobId, payload.chatId, true);
    } catch (error) {
      clearPendingAssistant(getChatStateKey(chatId), assistantMessageId);
      patchMessage(getChatStateKey(chatId), assistantMessageId, (message) => ({
        ...message,
        content: "Sorry, there was an error processing your answer.",
      }));
    } finally {
      requestAbortControllerRef.current = null;
    }
  };

  const handleSuggestionClick = (feature: ActiveBadge) => {
    const slideCount = feature.templateInfo?.template.slides.length ?? feature.slideCount;
    setActiveBadges([{ ...feature, slideCount }]);

    if (feature.prompt) {
      setInput(feature.prompt);
    }
  };

  const removeBadge = (label: string) => {
    setActiveBadges((prev) => prev.filter((badge) => badge.label !== label));
  };

  const updateSlideCount = (label: string, count: number) => {
    setActiveBadges((prev) =>
      prev.map((badge) => (badge.label === label ? { ...badge, slideCount: count } : badge))
    );
  };

  const isInitialState = messages.length === 0 && !chatId;

  return {
    state: {
      messages,
      slideState,
      input,
      isTyping,
      agentConfig,
      showPreview,
      messagesEndRef,
      activeBadges,
      sandboxId,
      chatId,
      selectedWorkspaceId,
      jobId,
      sidebarRefreshKey,
      isProcessing,
      activeAgent,
      pendingQuestion,
      currentView,
      isSidebarOpen,
      attachedFiles,
      isInitialState,
      availableModels,
      selectedModelId,
      isModelLoading,
      isModelUpdating,
      webBrowsingEnabled,
    },
    actions: {
      setInput,
      setShowPreview,
      setIsSidebarOpen,
      setAttachedFiles,
      handleNavigate,
      handleSelectChat,
      handleNewChat,
      handleSelectWorkspace,
      handleOpenWorkspace,
      handleCreateChatInWorkspace,
      handleSend,
      handleStop,
      handleAnswerQuestion,
      handleSuggestionClick,
      removeBadge,
      updateSlideCount,
      removeAttachedFile,
      handleSelectModel,
      setWebBrowsingEnabled,
      clearPendingQuestion: () => clearPendingQuestionForChat(getChatStateKey(chatId)),
    },
  };
}
