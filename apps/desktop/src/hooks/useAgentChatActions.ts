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
  setError: Dispatch<SetStateAction<string | null>>;
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
  setError,
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
    setPendingQuestion(null);
    if (!selectedWorkspace || !activeConversation?.backend_session_id) return;

    const reply = answers.filter(Boolean).join("\n");
    if (!reply) return;

    // For the khadim backend the agent loop is still running — the question
    // tool is awaiting a oneshot channel.  Just resolve it; the loop continues.
    if (selectedWorkspace.backend === "khadim") {
      try {
        await commands.khadimAnswerQuestion(activeConversation.backend_session_id, reply);
      } catch (error) {
        setError(getErrorMessage(error));
      }
      return;
    }

    // OpenCode path — sends a follow-up message to resume the session.
    setAgentChatInput("");
    setIsProcessing(true);
    setStreamingContent("");
    setStreamingSteps([]);
    erroredAgentSessionsRef.current.delete(activeConversation.backend_session_id);
    setError(null);

    if (focusedAgentId) {
      setAgents((prev) => prev.map((agent) => {
        if (agent.id !== focusedAgentId) return agent;
        return {
          ...agent,
          status: "running",
          streamingContent: "",
          streamPreview: [],
          streamingSteps: [],
          currentActivity: "Answering question...",
        };
      }));
    }

    try {
      await commands.opencodeSendStreaming(
        selectedWorkspace.id,
        activeConversation.backend_session_id,
        activeConversation.id,
        reply,
        selectedModel,
      );
      await queryClient.invalidateQueries({ queryKey: desktopQueryKeys.messages(activeConversation.id) });
    } catch (error) {
      setError(getErrorMessage(error));
      setIsProcessing(false);
      setStreamingContent("");
      setStreamingSteps([]);
    }
  }, [
    activeConversation,
    erroredAgentSessionsRef,
    focusedAgentId,
    getErrorMessage,
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
