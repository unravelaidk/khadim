import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { Conversation, OpenCodeModelOption, OpenCodeModelRef, PendingApproval, PendingQuestion, ThinkingStepData, Workspace } from "../lib/bindings";
import { commands } from "../lib/bindings";
import { desktopQueryKeys } from "../lib/queries";
import { getModelSettingKey } from "../lib/model-selection";
import type { AgentInstance } from "../lib/types";

interface UseAgentChatActionsArgs {
  queryClient: QueryClient;
  selectedWorkspace: Workspace | null;
  activeConversation: Conversation | null;
  focusedAgentId: string | null;
  agents: AgentInstance[];
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
  pendingQuestion: PendingQuestion | null;
  setPendingQuestion: Dispatch<SetStateAction<PendingQuestion | null>>;
  pendingApproval: PendingApproval | null;
  setPendingApproval: Dispatch<SetStateAction<PendingApproval | null>>;
  setAgents: Dispatch<SetStateAction<AgentInstance[]>>;
  erroredAgentSessionsRef: MutableRefObject<Set<string>>;
  handleNewConversation: () => Promise<Conversation | null>;
  getErrorMessage: (error: unknown) => string;
}

function flattenQuestionAnswers(answers: string[][]) {
  return answers
    .map((group) => group.map((value) => value.trim()).filter(Boolean).join(", "))
    .filter(Boolean);
}

export function useAgentChatActions({
  queryClient,
  selectedWorkspace,
  activeConversation,
  focusedAgentId,
  agents,
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
  pendingApproval,
  setPendingApproval,
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
    if (!conversation && focusedAgentId) {
      // The conversation may exist but the query hasn't refetched yet.
      // Look for a matching agent with a sessionId instead of creating a duplicate.
      const matchedAgent = agents.find((a) => a.id === focusedAgentId);
      if (matchedAgent?.sessionId) {
        // Build a minimal conversation-like object so we can proceed
        conversation = {
          id: matchedAgent.id,
          workspace_id: selectedWorkspace.id,
          backend: selectedWorkspace.backend,
          backend_session_id: matchedAgent.sessionId,
          backend_session_cwd: null,
          branch: matchedAgent.branch ?? null,
          worktree_path: matchedAgent.worktreePath ?? null,
          title: matchedAgent.label,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          input_tokens: 0,
          output_tokens: 0,
        } as Conversation;
      }
    }
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
    agents,
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

  const handleQuestionAnswer = useCallback(async (answers: string[][]) => {
    const currentQuestion = pendingQuestion;
    if (!currentQuestion) return;

    const flattenedAnswers = flattenQuestionAnswers(answers);
    const reply = flattenedAnswers.join("\n");
    if (!reply) return;

    const isActiveQuestion = activeConversation?.backend_session_id === currentQuestion.sessionId;

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
      await commands.opencodeReplyQuestion(
        currentQuestion.workspaceId,
        currentQuestion.id,
        answers.map((group) => group.map((value) => value.trim()).filter(Boolean)),
      );
      setPendingQuestion(null);
      if (currentQuestion.conversationId) {
        await queryClient.invalidateQueries({ queryKey: desktopQueryKeys.messages(currentQuestion.conversationId) });
      }
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
    setAgentChatInput,
    setAgents,
    setError,
    setIsProcessing,
    setPendingQuestion,
    setStreamingContent,
    setStreamingSteps,
  ]);

  const handleQuestionDismiss = useCallback(async () => {
    const currentQuestion = pendingQuestion;
    if (!currentQuestion) return;

    if (currentQuestion.backend === "khadim") {
      await handleQuestionAnswer([["(skipped)"]]);
      return;
    }

    try {
      setError(null);
      await commands.opencodeRejectQuestion(currentQuestion.workspaceId, currentQuestion.id);
      setPendingQuestion(null);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }, [getErrorMessage, handleQuestionAnswer, pendingQuestion, setError, setPendingQuestion]);

  const handleApprovalDecision = useCallback(async (allow: boolean, remember = false) => {
    const currentApproval = pendingApproval;
    if (!currentApproval) return;

    try {
      setError(null);
      await commands.claudeCodeRespondPermission(
        currentApproval.sessionId,
        currentApproval.id,
        allow,
        allow && remember && currentApproval.canRemember,
      );
      setPendingApproval(null);

      setAgents((prev) => prev.map((agent) => {
        if (agent.sessionId !== currentApproval.sessionId) return agent;
        return {
          ...agent,
          status: "running",
          currentActivity: allow ? "Resuming…" : "Approval denied",
        };
      }));
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }, [getErrorMessage, pendingApproval, setAgents, setError, setPendingApproval]);

  return {
    handleChatSend,
    handleAbort,
    handleQuestionAnswer,
    handleQuestionDismiss,
    handleApprovalDecision,
  };
}
