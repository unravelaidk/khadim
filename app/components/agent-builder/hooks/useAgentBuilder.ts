import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useNavigate } from "react-router";
import type { AgentConfig, Message, PendingQuestion } from "../../../types/chat";
import type { SlideTemplate, SlideTheme } from "../../../types/slides";
import type { AttachedFile } from "../WelcomeScreen";
import type { Workspace } from "../../workspace";
import { mockWorkspaces } from "../../workspace";
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
  jobId: string | null;
  sidebarRefreshKey: number;
  isProcessing: boolean;
  activeAgent: { mode: "plan" | "build"; name: string } | null;
  pendingQuestion: PendingQuestion | null;
  currentView: "chat" | "library";
  isSidebarOpen: boolean;
  attachedFiles: AttachedFile[];
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  isInitialState: boolean;
}

export interface AgentBuilderActions {
  setInput: (value: string) => void;
  setShowPreview: (value: boolean) => void;
  setIsSidebarOpen: (value: boolean) => void;
  setAttachedFiles: (files: AttachedFile[]) => void;
  setCurrentView: (view: "chat" | "library") => void;
  handleSelectChat: (selectedChatId: string | null) => Promise<void>;
  handleNewChat: () => void;
  handleSelectWorkspace: (id: string) => void;
  handleSend: () => Promise<void>;
  handleStop: () => void;
  handleAnswerQuestion: (answer: string) => Promise<void>;
  handleSuggestionClick: (feature: ActiveBadge) => void;
  removeBadge: (label: string) => void;
  updateSlideCount: (label: string, count: number) => void;
  removeAttachedFile: (fileName: string) => void;
  clearPendingQuestion: () => void;
}

export function useAgentBuilder({ initialChatId }: UseAgentBuilderOptions) {
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
  const [jobId, setJobId] = useState<string | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAgent, setActiveAgent] = useState<{ mode: "plan" | "build"; name: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initialLoadRef = useRef(false);

  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [currentView, setCurrentView] = useState<"chat" | "library">("chat");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [workspaces] = useState<Workspace[]>(mockWorkspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    mockWorkspaces[0]?.id ?? null
  );

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
        const jobResponse = await fetch(`/api/agent?chatId=${chat.id}`);
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

  const handleSelectWorkspace = (id: string) => {
    setSelectedWorkspaceId(id);
    setCurrentView("chat");
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
        const chatResponse = await fetch("/api/chats", {
          method: "POST",
          body: createChatForm,
        });
        if (chatResponse.ok) {
          const { chat } = await chatResponse.json();
          currentChatId = chat.id;
          setChatId(chat.id);
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
      jobId,
      sidebarRefreshKey,
      isProcessing,
      activeAgent,
      pendingQuestion,
      currentView,
      isSidebarOpen,
      attachedFiles,
      workspaces,
      selectedWorkspaceId,
      isInitialState,
    },
    actions: {
      setInput,
      setShowPreview,
      setIsSidebarOpen,
      setAttachedFiles,
      setCurrentView,
      handleSelectChat,
      handleNewChat,
      handleSelectWorkspace,
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
