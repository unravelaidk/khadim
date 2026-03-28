import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useNavigate } from "react-router";
import type { AgentConfig, Message, PendingQuestion } from "../../../types/chat";
import type { SlideTemplate, SlideTheme } from "../../../types/slides";
import type { AttachedFile } from "../WelcomeScreen";
import { useAgentStream } from "../../../hooks/useAgentStream";
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeBadges, setActiveBadges] = useState<ActiveBadge[]>([]);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(initialChatId || null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(initialWorkspaceId);
  const [jobId, setJobId] = useState<string | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAgent, setActiveAgent] = useState<{ mode: "plan" | "build"; name: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string>(getClientSessionId());
  const initialLoadRef = useRef(false);

  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [currentView, setCurrentView] = useState<"chat" | "workspace" | "settings">(initialView);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  const removeAttachedFile = (fileName: string) => {
    setAttachedFiles((prev) => prev.filter((file) => file.name !== fileName));
  };

  const { processStream } = useAgentStream({
    setMessages,
    setSandboxId,
    setJobId,
    setActiveAgent,
    setPendingQuestion,
    setPendingBuildDelegation: (prompt) => {
      if (prompt) setInput(prompt);
    },
    setIsTyping,
    setIsProcessing,
    chatId,
  });

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

      setMessages([...loadedMessages]);
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
          setSandboxId(newSandboxId);

          if (newPreviewUrl) {
            setMessages((prev) =>
              prev.map((msg) => (msg.previewUrl ? { ...msg, previewUrl: newPreviewUrl } : msg))
            );
          }
        }
      }

      try {
        const jobResponse = await fetch(`/api/agent?chatId=${chat.id}&sessionId=${encodeURIComponent(sessionIdRef.current)}`);
        if (!jobResponse.ok) return;

        setIsProcessing(true);
        setIsTyping(true);

        const lastMsg = loadedMessages[loadedMessages.length - 1];
        let targetMessageId: string;
        let existingSteps: any[] = [];

        if (lastMsg && lastMsg.role === "assistant") {
          targetMessageId = lastMsg.id;
          existingSteps = lastMsg.thinkingSteps || [];
        } else {
          targetMessageId = (Date.now() + 1).toString();
          const assistantMessage: Message = {
            id: targetMessageId,
            role: "assistant",
            content: "",
            timestamp: new Date(),
            thinkingSteps: [],
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }

        processStream(jobResponse, targetMessageId, existingSteps).catch((error) => {
          console.error("Error resuming stream:", error);
          setIsProcessing(false);
          setIsTyping(false);
        });
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
    setSandboxId(null);
    setJobId(null);
    setMessages([]);
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setAttachedFiles([]);
    setIsTyping(true);
    setIsProcessing(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

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

      await processStream(response, assistantMessageId);
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error.message.includes("Cancelled by user"))) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: "⏹️ Request stopped by user." }
              : msg
          )
        );
        agentMessages.cancelled();
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content:
                    "Sorry, I encountered an error connecting to the agent. Please check your API key and try again.",
                }
              : msg
          )
        );
        agentMessages.failed(error instanceof Error ? error.message : undefined);
      }
    } finally {
      setIsTyping(false);
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsTyping(false);
    setIsProcessing(false);
    if (jobId || chatId) {
      const stopForm = new FormData();
      if (jobId) stopForm.append("jobId", jobId);
      if (chatId) stopForm.append("chatId", chatId);
      stopForm.append("sessionId", sessionIdRef.current);
      fetch("/api/agent/stop", { method: "POST", body: stopForm });
    }
    abortControllerRef.current = null;
  };

  const handleAnswerQuestion = async (answer: string) => {
    if (!pendingQuestion) return;

    setPendingQuestion(null);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: answer,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

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
    setIsProcessing(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      thinkingSteps: [],
    };

    setMessages((prev) => [...prev, assistantMessage]);

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

      await processStream(response, assistantMessageId);
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: "Sorry, there was an error processing your answer." }
            : msg
        )
      );
    } finally {
      setIsTyping(false);
      setIsProcessing(false);
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
      clearPendingQuestion: () => setPendingQuestion(null),
    },
  };
}
