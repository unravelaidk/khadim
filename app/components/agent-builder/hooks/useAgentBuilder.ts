import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useNavigate } from "react-router";
import type { AgentConfig, Message, PendingQuestion, ThinkingStepData } from "../../../types/chat";
import type { SlideTemplate, SlideTheme } from "../../../types/slides";
import type { AttachedFile } from "../WelcomeScreen";
import type { ModelOption } from "../ModelSelector";
import { agentMessages, showError } from "../../../lib/toast";

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

type ActiveAgentState = { mode: "plan" | "build"; name: string } | null;

interface StreamEvent {
  type: string;
  jobId?: string;
  chatId?: string;
  sessionId?: string;
  id?: number | string;
  [key: string]: unknown;
}

interface JobSnapshot {
  id: string;
  chatId: string;
  sessionId: string;
  status: "running" | "completed" | "error" | "cancelled";
  steps: Message["thinkingSteps"];
  finalContent: string;
  previewUrl: string | null;
  sandboxId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChatRuntimeState {
  messages: Message[];
  sandboxId: string | null;
  activeJobIds: string[];
  pendingQuestion: PendingQuestion | null;
  activeAgent: ActiveAgentState;
}

const DRAFT_CHAT_KEY = "__draft__";

function createEmptyChatRuntime(): ChatRuntimeState {
  return {
    messages: [],
    sandboxId: null,
    activeJobIds: [],
    pendingQuestion: null,
    activeAgent: null,
  };
}

function getChatStateKey(chatId: string | null | undefined): string {
  return chatId || DRAFT_CHAT_KEY;
}

export function useAgentBuilder({ initialChatId, initialView = "chat", initialWorkspaceId = null }: UseAgentBuilderOptions) {
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
  const [chatStates, setChatStates] = useState<Record<string, ChatRuntimeState>>({});
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
  const initialLoadRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  const jobMessageIdsRef = useRef<Record<string, string>>({});
  const jobChatIdsRef = useRef<Record<string, string>>({});
  const latestChatStatesRef = useRef<Record<string, ChatRuntimeState>>({});

  const [currentView, setCurrentView] = useState<"chat" | "workspace" | "settings">(initialView);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isModelUpdating, setIsModelUpdating] = useState(false);
  const [webBrowsingEnabled, setWebBrowsingEnabled] = useState(true);

  const currentChatKey = getChatStateKey(chatId);
  const currentChatState = chatStates[currentChatKey] || createEmptyChatRuntime();
  const messages = currentChatState.messages;
  const sandboxId = currentChatState.sandboxId;
  const pendingQuestion = currentChatState.pendingQuestion;
  const activeAgent = currentChatState.activeAgent;
  const activeJobIds = currentChatState.activeJobIds;
  const jobId = activeJobIds[activeJobIds.length - 1] || null;
  const isProcessing = activeJobIds.length > 0;

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

  const updateChatStateByKey = (
    chatKey: string,
    updater: (state: ChatRuntimeState) => ChatRuntimeState
  ) => {
    setChatStates((prev) => {
      const next = {
        ...prev,
        [chatKey]: updater(prev[chatKey] || createEmptyChatRuntime()),
      };
      latestChatStatesRef.current = next;
      return next;
    });
  };

  const replaceChatStateKey = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;

    setChatStates((prev) => {
      const fromState = prev[fromKey];
      const toState = prev[toKey] || createEmptyChatRuntime();
      if (!fromState) return prev;

      const next = {
        ...prev,
        [toKey]: {
          ...toState,
          messages: fromState.messages.length > 0 ? fromState.messages : toState.messages,
          sandboxId: fromState.sandboxId || toState.sandboxId,
          activeJobIds: Array.from(new Set([...toState.activeJobIds, ...fromState.activeJobIds])),
          pendingQuestion: fromState.pendingQuestion || toState.pendingQuestion,
          activeAgent: fromState.activeAgent || toState.activeAgent,
        },
      };
      delete next[fromKey];
      latestChatStatesRef.current = next;
      return next;
    });
  };

  const upsertAssistantMessage = (chatKey: string, messageId: string, updater: (message: Message) => Message) => {
    updateChatStateByKey(chatKey, (state) => ({
      ...state,
      messages: state.messages.map((message) => (message.id === messageId ? updater(message) : message)),
    }));
  };

  const ensureJobMessage = (jobIdValue: string, chatIdValue: string) => {
    const chatKey = getChatStateKey(chatIdValue);
    jobChatIdsRef.current[jobIdValue] = chatKey;

    let messageId = jobMessageIdsRef.current[jobIdValue];
    if (messageId) {
      return { chatKey, messageId };
    }

    messageId = `job-${jobIdValue}`;
    jobMessageIdsRef.current[jobIdValue] = messageId;
    updateChatStateByKey(chatKey, (state) => {
      if (state.messages.some((message) => message.id === messageId)) {
        return state;
      }

      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: messageId,
            role: "assistant" as const,
            content: "",
            timestamp: new Date(),
            thinkingSteps: [],
          },
        ],
      };
    });

    return { chatKey, messageId };
  };

  const setJobActive = (jobIdValue: string, chatIdValue: string, active: boolean) => {
    const chatKey = getChatStateKey(chatIdValue);
    updateChatStateByKey(chatKey, (state) => ({
      ...state,
      activeJobIds: active
        ? Array.from(new Set([...state.activeJobIds, jobIdValue]))
        : state.activeJobIds.filter((existingJobId) => existingJobId !== jobIdValue),
      activeAgent: active ? state.activeAgent : state.activeJobIds.length <= 1 ? null : state.activeAgent,
    }));
  };

  const applyJobSnapshot = (job: JobSnapshot) => {
    const { chatKey, messageId } = ensureJobMessage(job.id, job.chatId);
    updateChatStateByKey(chatKey, (state) => {
      const nextMessages = state.messages.some((message) => message.id === messageId)
        ? state.messages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: job.finalContent || message.content,
                  previewUrl: job.previewUrl || message.previewUrl,
                  thinkingSteps: job.steps || message.thinkingSteps,
                }
              : message
          )
        : [
            ...state.messages,
            {
              id: messageId,
              role: "assistant" as const,
              content: job.finalContent,
              timestamp: new Date(job.createdAt),
              previewUrl: job.previewUrl || undefined,
              thinkingSteps: job.steps || [],
            },
          ];

      return {
        ...state,
        messages: nextMessages,
        sandboxId: job.sandboxId || state.sandboxId,
        activeJobIds:
          job.status === "running"
            ? Array.from(new Set([...state.activeJobIds, job.id]))
            : state.activeJobIds.filter((existingJobId) => existingJobId !== job.id),
      };
    });
  };

  const applyStreamEvent = (event: StreamEvent) => {
    if (event.type === "session_connected") {
      return;
    }

    if (event.type === "job_snapshot") {
      applyJobSnapshot(event as unknown as JobSnapshot);
      return;
    }

    const streamJobId = typeof event.jobId === "string" ? event.jobId : null;
    const streamChatId = typeof event.chatId === "string" ? event.chatId : null;
    if (!streamJobId || !streamChatId) {
      return;
    }

    const { chatKey, messageId } = ensureJobMessage(streamJobId, streamChatId);

    if (event.type === "job_created") {
      setJobActive(streamJobId, streamChatId, true);
      return;
    }

    if (event.type === "agent_mode") {
      updateChatStateByKey(chatKey, (state) => ({
        ...state,
        activeAgent: { mode: event.mode as "plan" | "build", name: event.name as string },
      }));
      return;
    }

    if (event.type === "sandbox_info") {
      updateChatStateByKey(chatKey, (state) => ({
        ...state,
        sandboxId: typeof event.sandboxId === "string" ? event.sandboxId : state.sandboxId,
      }));
      return;
    }

    if (event.type === "step_start") {
      const stepId = String(event.id);
      const nextStep: ThinkingStepData = {
        id: stepId,
        title: event.title as string,
        status: "running",
        content: "",
        tool: event.tool as ThinkingStepData["tool"],
        filename: (event.filename || (event.args as { path?: string } | undefined)?.path) as string | undefined,
        fileContent: (event.fileContent || (event.args as { content?: string } | undefined)?.content) as string | undefined,
      };
      upsertAssistantMessage(chatKey, messageId, (message) => ({
        ...message,
        thinkingSteps: [
          ...(message.thinkingSteps || []),
          ...(message.thinkingSteps || []).some((step) => step.id === stepId)
            ? []
            : [nextStep],
        ],
      }));
      return;
    }

    if (event.type === "step_update") {
      const stepId = String(event.id);
      upsertAssistantMessage(chatKey, messageId, (message) => ({
        ...message,
        thinkingSteps: (message.thinkingSteps || []).map((step) =>
          step.id === stepId ? { ...step, content: event.content as string } : step
        ),
      }));
      return;
    }

    if (event.type === "step_complete") {
      const stepId = String(event.id);
      const completeStep = (step: ThinkingStepData): ThinkingStepData => ({
        ...step,
        status: "complete",
        result: (event.result ?? step.result) as string | undefined,
        filename: step.filename || (event.filename as string | undefined),
        fileContent: step.fileContent || (event.fileContent as string | undefined),
      });
      upsertAssistantMessage(chatKey, messageId, (message) => ({
        ...message,
        thinkingSteps: (message.thinkingSteps || []).map((step) =>
          step.id === stepId ? completeStep(step) : step
        ),
      }));
      return;
    }

    if (event.type === "text_delta") {
      upsertAssistantMessage(chatKey, messageId, (message) => ({
        ...message,
        content: `${message.content}${String(event.content || "")}`,
      }));
      return;
    }

    if (event.type === "slide_content") {
      upsertAssistantMessage(chatKey, messageId, (message) => ({
        ...message,
        fileContent: event.fileContent as string | undefined,
      }));
      return;
    }

    if (event.type === "file_written") {
      const filename = typeof event.filename === "string" ? event.filename : undefined;
      const fileContent = typeof event.content === "string" ? event.content : undefined;
      if (filename === "index.html" && fileContent?.includes('<script id="slide-data"')) {
        upsertAssistantMessage(chatKey, messageId, (message) => ({ ...message, fileContent }));
      }
      return;
    }

    if (event.type === "ask_user") {
      updateChatStateByKey(chatKey, (state) => ({
        ...state,
        pendingQuestion: {
          question: event.question as string,
          options: event.options as PendingQuestion["options"],
          context: event.context as string,
          threadId: event.threadId as string,
        },
      }));
      setIsTyping(false);
      upsertAssistantMessage(chatKey, messageId, (message) => ({
        ...message,
        content: "I have a question for you...",
      }));
      return;
    }

    if (event.type === "delegate_build") {
      upsertAssistantMessage(chatKey, messageId, (message) => ({
        ...message,
        content: "Plan approved! The Build agent will now execute...",
      }));
      const buildPrompt = `Execute this approved plan:\n\n${event.plan as string}${event.context ? `\n\nContext: ${event.context as string}` : ""}`;
      setInput(buildPrompt);
      return;
    }

    if (event.type === "done") {
      setJobActive(streamJobId, streamChatId, false);
      setIsTyping(false);
      upsertAssistantMessage(chatKey, messageId, (message) => ({
        ...message,
        content: (event.content ?? message.content) as string,
        previewUrl: event.previewUrl as string | undefined,
      }));
      updateChatStateByKey(chatKey, (state) => ({ ...state, activeAgent: null }));
      return;
    }

    if (event.type === "error") {
      setJobActive(streamJobId, streamChatId, false);
      setIsTyping(false);
      updateChatStateByKey(chatKey, (state) => ({ ...state, activeAgent: null }));
    }
  };

  const formatAttachmentSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const buildAttachmentContext = (files: AttachedFile[]) => {
    const MAX_CONTENT_CHARS = 4000;
    if (files.length === 0) return "";

    return files
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

      updateChatStateByKey(chat.id, (state) => ({
        ...state,
        messages: loadedMessages,
        sandboxId: chat.sandboxId || state.sandboxId,
      }));
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
          updateChatStateByKey(chat.id, (state) => ({ ...state, sandboxId: newSandboxId }));

          if (newPreviewUrl) {
            updateChatStateByKey(chat.id, (state) => ({
              ...state,
              messages: state.messages.map((message) =>
                message.previewUrl ? { ...message, previewUrl: newPreviewUrl } : message
              ),
            }));
          }
        }
      }

      try {
        const jobResponse = await fetch(`/api/agent?chatId=${chat.id}&sessionId=${encodeURIComponent(sessionIdRef.current)}`);
        if (!jobResponse.ok) return;

        const payload = (await jobResponse.json()) as { jobs?: JobSnapshot[] };
        for (const activeJob of payload.jobs || []) {
          applyJobSnapshot(activeJob);
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
    updateChatStateByKey(DRAFT_CHAT_KEY, () => createEmptyChatRuntime());
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
    if (currentView === "chat") {
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
    const source = new EventSource(`/api/agent/stream?sessionId=${encodeURIComponent(sessionId)}`);
    eventSourceRef.current = source;

    source.onmessage = (messageEvent) => {
      try {
        applyStreamEvent(JSON.parse(messageEvent.data) as StreamEvent);
      } catch (error) {
        console.error("Failed to parse session stream event:", error);
      }
    };

    source.onerror = (error) => {
      console.error("Session stream error:", error);
    };

    return () => {
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
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

    const attachmentContext = buildAttachmentContext(attachedFiles);
    const promptWithAttachments = attachmentContext
      ? `${userMessage.content}\n\nAttached files:\n${attachmentContext}`
      : userMessage.content;

    const draftChatKey = getChatStateKey(chatId);
    updateChatStateByKey(draftChatKey, (state) => ({
      ...state,
      messages: [...state.messages, userMessage, assistantMessage],
    }));
    setInput("");
    setAttachedFiles([]);
    setIsTyping(true);

    const abortController = new AbortController();
    requestAbortControllerRef.current = abortController;

    try {
      let currentChatId = chatId;
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
          replaceChatStateKey(DRAFT_CHAT_KEY, chat.id);
          setChatId(chat.id);
          setSelectedWorkspaceId(chat.workspaceId || selectedWorkspaceId || null);
          setSidebarRefreshKey((prev) => prev + 1);
          navigate(`/agent/${chat.id}`, { replace: true });
        }
      }

      const createUserMessageRequest = currentChatId
        ? () => {
            const userMsgForm = new FormData();
            userMsgForm.append("chatId", currentChatId);
            userMsgForm.append("role", "user");
            userMsgForm.append("content", userMessage.content);
            return fetch("/api/messages", { method: "POST", body: userMsgForm });
          }
        : null;

      const formData = new FormData();
      formData.append("prompt", promptWithAttachments);
      if (sandboxId) {
        formData.append("sandboxId", sandboxId);
      }
      if (currentChatId) {
        formData.append("chatId", currentChatId);
      }
      formData.append("sessionId", sessionIdRef.current);
      if (activeBadges.length > 0) {
        formData.append("badges", JSON.stringify(activeBadges));
      }
      formData.append("webBrowsing", webBrowsingEnabled ? "true" : "false");

      const [response] = await Promise.all([
        fetch("/api/agent", {
          method: "POST",
          body: formData,
          signal: abortController.signal,
        }),
        createUserMessageRequest?.(),
      ]);

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const payload = (await response.json()) as { jobId?: string; chatId?: string };
      if (!payload.jobId || !payload.chatId) {
        throw new Error("Missing job metadata");
      }

      jobMessageIdsRef.current[payload.jobId] = assistantMessageId;
      jobChatIdsRef.current[payload.jobId] = getChatStateKey(payload.chatId);
      setJobActive(payload.jobId, payload.chatId, true);
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error.message.includes("Cancelled by user"))) {
        updateChatStateByKey(getChatStateKey(chatId), (state) => ({
          ...state,
          messages: state.messages.map((message) =>
            message.id === assistantMessageId ? { ...message, content: "⏹️ Request stopped by user." } : message
          ),
        }));
        agentMessages.cancelled();
      } else {
        updateChatStateByKey(getChatStateKey(chatId), (state) => ({
          ...state,
          messages: state.messages.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content:
                    "Sorry, I encountered an error connecting to the agent. Please check your API key and try again.",
                }
              : message
          ),
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
      const stopForm = new FormData();
      stopForm.append("jobId", jobId);
      stopForm.append("chatId", chatId);
      stopForm.append("sessionId", sessionIdRef.current);
      fetch("/api/agent/stop", { method: "POST", body: stopForm });
    }
    requestAbortControllerRef.current = null;
  };

  const handleAnswerQuestion = async (answer: string) => {
    if (!pendingQuestion) return;

    updateChatStateByKey(getChatStateKey(chatId), (state) => ({ ...state, pendingQuestion: null }));

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: answer,
      timestamp: new Date(),
    };

    updateChatStateByKey(getChatStateKey(chatId), (state) => ({
      ...state,
      messages: [...state.messages, userMessage],
    }));

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

    const formData = new FormData();
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

    formData.append("prompt", nextPrompt);
    formData.append("agentMode", nextMode);
    if (sandboxId) {
      formData.append("sandboxId", sandboxId);
    }
    if (chatId) {
      formData.append("chatId", chatId);
    }
    if (pendingQuestion.threadId) {
      formData.append("threadId", pendingQuestion.threadId);
    }
    formData.append("sessionId", sessionIdRef.current);

    setIsTyping(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      thinkingSteps: [],
    };

    updateChatStateByKey(getChatStateKey(chatId), (state) => ({
      ...state,
      messages: [...state.messages, assistantMessage],
    }));

    try {
      const [response] = await Promise.all([
        fetch("/api/agent", {
          method: "POST",
          body: formData,
        }),
        saveUserMessage?.(),
      ]);

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const payload = (await response.json()) as { jobId?: string; chatId?: string };
      if (!payload.jobId || !payload.chatId) {
        throw new Error("Missing job metadata");
      }

      jobMessageIdsRef.current[payload.jobId] = assistantMessageId;
      jobChatIdsRef.current[payload.jobId] = getChatStateKey(payload.chatId);
      setJobActive(payload.jobId, payload.chatId, true);
    } catch (error) {
      updateChatStateByKey(getChatStateKey(chatId), (state) => ({
        ...state,
        messages: state.messages.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: "Sorry, there was an error processing your answer." }
            : message
        ),
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
      clearPendingQuestion: () =>
        updateChatStateByKey(getChatStateKey(chatId), (state) => ({ ...state, pendingQuestion: null })),
    },
  };
}
