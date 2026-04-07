import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { Conversation, OpenCodeModelOption, OpenCodeModelRef, ThinkingStepData, Workspace } from "../lib/bindings";
import { commands } from "../lib/bindings";
import { desktopQueryKeys } from "../lib/queries";
import { getModelSettingKey } from "../lib/model-selection";
import type { AgentInstance } from "../lib/types";

interface UseAgentChatActionsArgs {
  queryClient: QueryClient;
  selectedWorkspace: Workspace | null;
  activeConversation: Conversation | null;
  focusedAgentId: string | null;
  selectedModel: OpenCodeModelRef | null;
  agentChatInput: string;
  availableModels: OpenCodeModelOption[];
  setSetting: (key: string, value: string) => Promise<unknown>;
  setSelectedModelOverride: Dispatch<SetStateAction<OpenCodeModelRef | null>>;
  setAgentChatInput: Dispatch<SetStateAction<string>>;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  setStreamingContent: Dispatch<SetStateAction<string>>;
  setStreamingSteps: Dispatch<SetStateAction<ThinkingStepData[]>>;
  completedStepsRef: MutableRefObject<Map<string, ThinkingStepData[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  pendingQuestion: import("../lib/bindings").PendingQuestion | null;
  setPendingQuestion: Dispatch<SetStateAction<import("../lib/bindings").PendingQuestion | null>>;
  setAgents: Dispatch<SetStateAction<AgentInstance[]>>;
  erroredAgentSessionsRef: MutableRefObject<Set<string>>;
  handleNewConversation: () => Promise<Conversation | null>;
  getErrorMessage: (error: unknown) => string;
}

export function useAgentChatActions({
  queryClient,
  selectedWorkspace,
  activeConversation,
  focusedAgentId,
  selectedModel,
  agentChatInput,
  availableModels,
  setSetting,
  setSelectedModelOverride,
  setAgentChatInput,
  setIsProcessing,
  setStreamingContent,
  setStreamingSteps,
  completedStepsRef,
  setError,
  pendingQuestion,
  setPendingQuestion,
  setAgents,
  erroredAgentSessionsRef,
  handleNewConversation,
  getErrorMessage,
}: UseAgentChatActionsArgs) {
  const ensureModelForSend = useCallback(async () => {
    if (!selectedWorkspace) return selectedModel;
    if (selectedModel) return selectedModel;

    const models = selectedWorkspace.backend === "opencode"
      ? await commands.opencodeListModels(selectedWorkspace.id).catch(() => [])
      : selectedWorkspace.backend === "claude_code"
        ? await commands.claudeCodeListModels().catch(() => [])
        : await commands.khadimListModels().catch(() => []);

    if (models.length === 0) return null;

    const fallback = models.find((model) => model.is_default) ?? models[0];
    const nextModel = { provider_id: fallback.provider_id, model_id: fallback.model_id };
    setSelectedModelOverride(nextModel);
    await setSetting(getModelSettingKey(selectedWorkspace.id), JSON.stringify(nextModel)).catch(() => undefined);
    return nextModel;
  }, [selectedModel, selectedWorkspace, setSelectedModelOverride, setSetting]);

  const handleChatSend = useCallback(async () => {
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
    const modelForSend = await ensureModelForSend();

    setAgentChatInput("");
    setIsProcessing(true);
    setStreamingContent("");
    setStreamingSteps([]);
    completedStepsRef.current.delete(conversation.id);
    erroredAgentSessionsRef.current.delete(conversation.backend_session_id);
    setError(null);

    if (focusedAgentId) {
      setAgents((prev) => prev.map((agent) => {
        if (agent.id !== focusedAgentId) return agent;
        return {
          ...agent,
          status: "running",
          startedAt: new Date().toISOString(),
          streamingContent: "",
          streamPreview: [],
          streamingSteps: [],
          currentActivity: "Starting...",
        };
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
      } else if (selectedWorkspace.backend === "claude_code") {
        await commands.claudeCodeSendStreaming(
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
      await queryClient.invalidateQueries({ queryKey: desktopQueryKeys.messages(conversation.id) });
    } catch (error) {
      const message = getErrorMessage(error);
      setError(message);
      setIsProcessing(false);
      setStreamingContent("");
      setStreamingSteps([]);
      if (focusedAgentId) {
        setAgents((prev) => prev.map((agent) => {
          if (agent.id !== focusedAgentId) return agent;
          return { ...agent, status: "error", errorMessage: message, finishedAt: new Date().toISOString() };
        }));
      }
    }
  }, [
    activeConversation,
    agentChatInput,
    ensureModelForSend,
    completedStepsRef,
    erroredAgentSessionsRef,
    focusedAgentId,
    getErrorMessage,
    handleNewConversation,
    queryClient,
    selectedWorkspace,
    setAgentChatInput,
    setAgents,
    setError,
    setIsProcessing,
    setStreamingContent,
    setStreamingSteps,
  ]);

  const handleAbort = useCallback(async () => {
    if (!selectedWorkspace || !activeConversation?.backend_session_id) return;
    try {
      if (selectedWorkspace.backend === "khadim") {
        await commands.khadimAbort(activeConversation.backend_session_id);
      } else if (selectedWorkspace.backend === "claude_code") {
        await commands.claudeCodeAbort(activeConversation.backend_session_id);
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
  }, [
    activeConversation,
    erroredAgentSessionsRef,
    getErrorMessage,
    selectedWorkspace,
    setAgents,
    setError,
    setIsProcessing,
    setStreamingContent,
    setStreamingSteps,
  ]);

  const handleQuestionAnswer = useCallback(async (answers: string[]) => {
    const currentQuestion = pendingQuestion;

    const reply = answers.filter(Boolean).join("\n");
    if (!currentQuestion || !reply) return;

    if (currentQuestion.backend === "khadim") {
      try {
        setError(null);
        await commands.khadimAnswerQuestion(currentQuestion.sessionId, reply);
        setPendingQuestion(null);
      } catch (error) {
        setError(getErrorMessage(error));
      }
      return;
    }

    if (!currentQuestion.conversationId) {
      setError("Unable to resume this question because its conversation could not be resolved.");
      return;
    }

    const isActiveQuestion = activeConversation?.backend_session_id === currentQuestion.sessionId;

    if (isActiveQuestion) {
      setAgentChatInput("");
      setIsProcessing(true);
      setStreamingContent("");
      setStreamingSteps([]);
      erroredAgentSessionsRef.current.delete(currentQuestion.sessionId);
      setError(null);
    }

    setAgents((prev) => prev.map((agent) => {
      if (agent.sessionId !== currentQuestion.sessionId) return agent;
      return {
        ...agent,
        status: "running",
        streamingContent: "",
        streamPreview: [],
        streamingSteps: [],
        currentActivity: "Answering question...",
      };
    }));

    try {
      await commands.opencodeSendStreaming(
        currentQuestion.workspaceId,
        currentQuestion.sessionId,
        currentQuestion.conversationId,
        reply,
        selectedWorkspace?.id === currentQuestion.workspaceId ? selectedModel : null,
      );
      setPendingQuestion(null);
      await queryClient.invalidateQueries({ queryKey: desktopQueryKeys.messages(currentQuestion.conversationId) });
    } catch (error) {
      setError(getErrorMessage(error));
      if (isActiveQuestion) {
        setIsProcessing(false);
        setStreamingContent("");
        setStreamingSteps([]);
      }
    }
  }, [
    activeConversation,
    erroredAgentSessionsRef,
    getErrorMessage,
    pendingQuestion,
    queryClient,
    selectedModel,
    selectedWorkspace,
    setAgentChatInput,
    setAgents,
    setError,
    setIsProcessing,
    setPendingQuestion,
    setStreamingContent,
    setStreamingSteps,
  ]);

  return {
    handleChatSend,
    handleAbort,
    handleQuestionAnswer,
  };
}
