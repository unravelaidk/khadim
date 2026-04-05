import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OpenCodeModelOption, OpenCodeModelRef, ThinkingStepData } from "../lib/bindings";
import type { LocalChatConversation, LocalChatMessage } from "../lib/types";
import { commands } from "../lib/bindings";
import { useSetSettingMutation, useSettingQuery, useWorkspaceModelsQuery } from "../lib/queries";
import { getModelSettingKey, parseStoredModel, resolvePreferredModel, selectModelByKey } from "../lib/model-selection";
import { createLocalConversation, createLocalMessage } from "../lib/types";

export interface StandaloneChatController {
  chatConversations: LocalChatConversation[];
  setChatConversations: React.Dispatch<React.SetStateAction<LocalChatConversation[]>>;
  activeChatId: string | null;
  activeChatConv: LocalChatConversation | null;
  standaloneChatInput: string;
  setStandaloneChatInput: (value: string) => void;
  chatIsProcessing: boolean;
  setChatIsProcessing: (value: boolean) => void;
  chatStreamingContent: string;
  setChatStreamingContent: (value: string) => void;
  chatStreamingSteps: ThinkingStepData[];
  setChatStreamingSteps: (value: ThinkingStepData[]) => void;
  chatAvailableModels: OpenCodeModelOption[];
  chatSelectedModel: OpenCodeModelRef | null;
  chatDirectory: string | null;
  setChatDirectory: (dir: string | null) => void;
  handleSelectChat: (id: string) => void;
  handleNewStandaloneChat: () => void;
  handleDeleteStandaloneChat: (id: string) => void;
  handleStandaloneChatSend: () => void;
  handleStandaloneChatAbort: () => Promise<void>;
  handleChatSelectModel: (modelKey: string) => Promise<void>;
  handleChatDirectoryChange: (dir: string | null) => Promise<void>;
  activeStandaloneIsProcessing: boolean;
  activeStandaloneStreamingContent: string;
  activeStandaloneStreamingSteps: ThinkingStepData[];
  chatSessionIdRef: React.MutableRefObject<string | null>;
  chatActiveConvIdRef: React.MutableRefObject<string | null>;
  chatConversationsRef: React.MutableRefObject<LocalChatConversation[]>;
  chatStreamingContentRef: React.MutableRefObject<string>;
  chatStreamingStepsRef: React.MutableRefObject<ThinkingStepData[]>;
  chatErroredSessionsRef: React.MutableRefObject<Set<string>>;
}

export function useStandaloneChat({
  standaloneWorkspaceId,
  getErrorMessage,
  finalizeSteps,
  setGlobalError,
  onCloseSettings,
}: {
  standaloneWorkspaceId: string;
  getErrorMessage: (error: unknown) => string;
  finalizeSteps: (steps: ThinkingStepData[]) => ThinkingStepData[];
  setGlobalError: (message: string | null) => void;
  onCloseSettings: () => void;
}): StandaloneChatController {
  const [chatConversations, setChatConversations] = useState<LocalChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [standaloneChatInput, setStandaloneChatInput] = useState("");
  const [chatIsProcessing, setChatIsProcessing] = useState(false);
  const [chatStreamingContent, setChatStreamingContent] = useState("");
  const [chatStreamingSteps, setChatStreamingSteps] = useState<ThinkingStepData[]>([]);
  const chatSessionIdRef = useRef<string | null>(null);
  const chatActiveConvIdRef = useRef<string | null>(null);
  const chatConversationsRef = useRef<LocalChatConversation[]>([]);
  const chatStreamingContentRef = useRef("");
  const chatStreamingStepsRef = useRef<ThinkingStepData[]>([]);
  const chatErroredSessionsRef = useRef<Set<string>>(new Set());
  const [chatSelectedModelOverride, setChatSelectedModelOverride] = useState<OpenCodeModelRef | null>(null);
  const [chatDirectory, setChatDirectory] = useState<string | null>(null);
  const { data: chatAvailableModels = [] } = useWorkspaceModelsQuery(standaloneWorkspaceId, "khadim", false);
  const { data: storedChatModel = null } = useSettingQuery(getModelSettingKey(standaloneWorkspaceId));
  const setSettingMutation = useSetSettingMutation();

  const activeChatConv = useMemo(
    () => chatConversations.find((conversation) => conversation.id === activeChatId) ?? null,
    [chatConversations, activeChatId],
  );

  const activeStandaloneIsProcessing = activeChatConv?.isProcessing ?? chatIsProcessing;
  const activeStandaloneStreamingContent = activeChatConv?.streamingContent ?? chatStreamingContent;
  const activeStandaloneStreamingSteps = activeChatConv?.streamingSteps ?? chatStreamingSteps;
  const chatSelectedModel = useMemo(
    () => resolvePreferredModel(chatAvailableModels, chatSelectedModelOverride ?? parseStoredModel(storedChatModel)),
    [chatAvailableModels, chatSelectedModelOverride, storedChatModel],
  );

  useEffect(() => {
    chatConversationsRef.current = chatConversations;
  }, [chatConversations]);

  useEffect(() => {
    chatActiveConvIdRef.current = activeChatId;
  }, [activeChatId]);

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

  const handleSelectChat = useCallback((id: string) => {
    setActiveChatId(id);
    onCloseSettings();
  }, [onCloseSettings]);

  const handleNewStandaloneChat = useCallback(() => {
    const conversation = createLocalConversation();
    setChatConversations((prev) => [conversation, ...prev]);
    setActiveChatId(conversation.id);
    setStandaloneChatInput("");
    onCloseSettings();
  }, [onCloseSettings]);

  const handleDeleteStandaloneChat = useCallback((id: string) => {
    setChatConversations((prev) => {
      const next = prev.filter((conversation) => conversation.id !== id);
      if (activeChatId === id) {
        setActiveChatId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  }, [activeChatId]);

  const handleStandaloneChatSend = useCallback(() => {
    const text = standaloneChatInput.trim();
    if (!text || activeStandaloneIsProcessing) return;

    let conversationId = activeChatId;
    if (!conversationId) {
      const conversation = createLocalConversation(text.slice(0, 40));
      setChatConversations((prev) => [conversation, ...prev]);
      conversationId = conversation.id;
      setActiveChatId(conversationId);
    }

    const userMessage = createLocalMessage("user", text);
    setChatConversations((prev) => prev.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      const title = conversation.messages.length === 0 ? text.slice(0, 40) : conversation.title;
      return {
        ...conversation,
        title,
        messages: [...conversation.messages, userMessage],
        isProcessing: true,
        streamingContent: "",
        streamingSteps: [],
        updatedAt: new Date().toISOString(),
      };
    }));
    setStandaloneChatInput("");
    setChatIsProcessing(true);
    setChatStreamingContent("");
    setChatStreamingSteps([]);
    chatStreamingContentRef.current = "";
    chatStreamingStepsRef.current = [];
    if (chatSessionIdRef.current) {
      chatErroredSessionsRef.current.delete(chatSessionIdRef.current);
    }
    setGlobalError(null);
    chatActiveConvIdRef.current = conversationId;

    void (async () => {
      try {
        let sessionId = chatConversationsRef.current.find((conversation) => conversation.id === conversationId)?.sessionId ?? null;
        if (!sessionId) {
          const created = await commands.khadimCreateSession(null);
          sessionId = created.id;
          setChatConversations((prev) => prev.map((conversation) => conversation.id === conversationId ? { ...conversation, sessionId } : conversation));
        }
        chatSessionIdRef.current = sessionId;

        let modelForSend = chatSelectedModel;
        if (!modelForSend) {
          if (chatAvailableModels.length > 0) {
            modelForSend = resolvePreferredModel(chatAvailableModels, null);
            setChatSelectedModelOverride(modelForSend);
            if (modelForSend) {
              await setSettingMutation.mutateAsync({
                key: getModelSettingKey(standaloneWorkspaceId),
                value: JSON.stringify(modelForSend),
              }).catch(() => undefined);
            }
          }
        }

        await commands.khadimSendStreaming(standaloneWorkspaceId, sessionId, null, text, modelForSend);
      } catch (error) {
        setChatIsProcessing(false);
        setChatStreamingContent("");
        setChatStreamingSteps([]);
        chatStreamingContentRef.current = "";
        chatStreamingStepsRef.current = [];
        setGlobalError(getErrorMessage(error));
      }
    })();
  }, [activeChatId, activeStandaloneIsProcessing, chatAvailableModels, chatSelectedModel, getErrorMessage, setGlobalError, setSettingMutation, standaloneChatInput, standaloneWorkspaceId]);

  const handleStandaloneChatAbort = useCallback(async () => {
    const sessionId = chatSessionIdRef.current;
    if (!sessionId) return;
    try {
      await commands.khadimAbort(sessionId);
    } catch {
      // Abort may fail if the run already finished.
    }

    const conversationId = chatActiveConvIdRef.current;
    const partialContent = chatStreamingContentRef.current;
    const partialSteps = finalizeSteps(chatStreamingStepsRef.current);

    if (conversationId && (partialContent || partialSteps.length > 0)) {
      const assistantMessage = createLocalMessage("assistant", partialContent || "(aborted)");
      (assistantMessage as LocalChatMessage).thinkingSteps = partialSteps;
      setChatConversations((prev) => prev.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        return {
          ...conversation,
          messages: [...conversation.messages, assistantMessage],
          isProcessing: false,
          streamingContent: "",
          streamingSteps: [],
          updatedAt: new Date().toISOString(),
        };
      }));
    } else if (conversationId) {
      setChatConversations((prev) => prev.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, isProcessing: false, streamingContent: "", streamingSteps: [] }
          : conversation,
      ));
    }

    setChatIsProcessing(false);
    setChatStreamingContent("");
    setChatStreamingSteps([]);
    chatStreamingContentRef.current = "";
    chatStreamingStepsRef.current = [];
    chatErroredSessionsRef.current.delete(sessionId);
  }, [finalizeSteps]);

  const handleChatSelectModel = useCallback(async (modelKey: string) => {
    const next = selectModelByKey(chatAvailableModels, modelKey);
    if (!next) return;
    setChatSelectedModelOverride(next);
    await setSettingMutation.mutateAsync({
      key: getModelSettingKey(standaloneWorkspaceId),
      value: JSON.stringify(next),
    });
  }, [chatAvailableModels, setSettingMutation, standaloneWorkspaceId]);

  const handleChatDirectoryChange = useCallback(async (dir: string | null) => {
    setChatDirectory(dir);
    await setSettingMutation.mutateAsync({
      key: "khadim:chat_directory",
      value: dir ?? "",
    });
  }, [setSettingMutation]);

  return {
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
  };
}
