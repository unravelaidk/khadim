import { useEffectEvent } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { AgentStreamEvent, PendingQuestion, ThinkingStepData } from "../lib/bindings";
import { desktopQueryKeys } from "../lib/queries";
import type { AgentInstance, LocalChatConversation, LocalChatMessage } from "../lib/types";
import { createLocalMessage } from "../lib/types";

interface UseAgentStreamHandlerArgs {
  queryClient: QueryClient;
  selectedWorkspaceId: string | null;
  selectedConversationId: string | null;
  activeConversationBackendSessionId: string | null;
  activeConversationId: string | null;
  setPendingQuestion: Dispatch<SetStateAction<PendingQuestion | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  setStreamingContent: Dispatch<SetStateAction<string>>;
  setStreamingSteps: Dispatch<SetStateAction<ThinkingStepData[]>>;
  setAgents: Dispatch<SetStateAction<AgentInstance[]>>;
  completedStepsRef: MutableRefObject<Map<string, ThinkingStepData[]>>;
  erroredAgentSessionsRef: MutableRefObject<Set<string>>;
  chatConversationsRef: MutableRefObject<LocalChatConversation[]>;
  chatActiveConvIdRef: MutableRefObject<string | null>;
  chatStreamingContentRef: MutableRefObject<string>;
  chatStreamingStepsRef: MutableRefObject<ThinkingStepData[]>;
  chatErroredSessionsRef: MutableRefObject<Set<string>>;
  setChatConversations: Dispatch<SetStateAction<LocalChatConversation[]>>;
  setChatStreamingContent: (value: string) => void;
  setChatStreamingSteps: (value: ThinkingStepData[]) => void;
  setChatIsProcessing: (value: boolean) => void;
  standaloneWorkspaceId: string;
  finalizeSteps: (steps: ThinkingStepData[]) => ThinkingStepData[];
  applyStreamingStepEvent: (prev: ThinkingStepData[], evt: AgentStreamEvent) => ThinkingStepData[];
  extractStreamPreview: (content: string, maxLines?: number) => string[];
  deriveCurrentActivity: (steps: ThinkingStepData[]) => string | null;
  formatStreamingError: (message: string | null | undefined) => string;
}

export function useAgentStreamHandler({
  queryClient,
  selectedWorkspaceId,
  selectedConversationId,
  activeConversationBackendSessionId,
  activeConversationId,
  setPendingQuestion,
  setError,
  setIsProcessing,
  setStreamingContent,
  setStreamingSteps,
  setAgents,
  completedStepsRef,
  erroredAgentSessionsRef,
  chatConversationsRef,
  chatActiveConvIdRef,
  chatStreamingContentRef,
  chatStreamingStepsRef,
  chatErroredSessionsRef,
  setChatConversations,
  setChatStreamingContent,
  setChatStreamingSteps,
  setChatIsProcessing,
  standaloneWorkspaceId,
  finalizeSteps,
  applyStreamingStepEvent,
  extractStreamPreview,
  deriveCurrentActivity,
  formatStreamingError,
}: UseAgentStreamHandlerArgs) {
  return useEffectEvent((evt: AgentStreamEvent) => {
    const standaloneChatIndex = evt.workspace_id === standaloneWorkspaceId
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
      } else if (evt.event_type === "done" || evt.event_type === "error") {
        if (evt.event_type === "done" && chatErroredSessionsRef.current.has(evt.session_id)) {
          chatErroredSessionsRef.current.delete(evt.session_id);
          return;
        }
        if (evt.event_type === "error") {
          chatErroredSessionsRef.current.add(evt.session_id);
        }

        const finalContent = standaloneConversation?.streamingContent ?? "";
        const finalSteps = finalizeSteps(standaloneConversation?.streamingSteps ?? []);
        const convId = standaloneConversation?.id ?? null;

        if (convId && (finalContent || finalSteps.length > 0)) {
          const assistantMsg = createLocalMessage("assistant", finalContent);
          if (finalSteps.length > 0) {
            (assistantMsg as LocalChatMessage).thinkingSteps = finalSteps;
          }
          setChatConversations((conversations) =>
            conversations.map((conversation) => {
              if (conversation.id !== convId) return conversation;
              return {
                ...conversation,
                messages: [...conversation.messages, assistantMsg],
                isProcessing: false,
                streamingContent: "",
                streamingSteps: [],
                updatedAt: new Date().toISOString(),
              };
            }),
          );
        } else if (convId) {
          setChatConversations((conversations) =>
            conversations.map((conversation) => conversation.id === convId
              ? { ...conversation, isProcessing: false, streamingContent: "", streamingSteps: [] }
              : conversation),
          );
        }

        if (chatActiveConvIdRef.current === standaloneConversation?.id) {
          chatStreamingContentRef.current = "";
          chatStreamingStepsRef.current = [];
          setChatStreamingContent("");
          setChatStreamingSteps([]);
          setChatIsProcessing(false);
        }

        if (evt.event_type === "error") {
          setError(formatStreamingError(evt.content));
        }
      }
      return;
    }

    if (evt.workspace_id !== selectedWorkspaceId) return;

    const isActiveSession = activeConversationBackendSessionId != null
      && evt.session_id === activeConversationBackendSessionId;

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
      if (isActiveSession && selectedConversationId) {
        setStreamingSteps((prev) => {
          if (prev.length > 0) {
            completedStepsRef.current.set(selectedConversationId, finalizeSteps(prev));
          }
          return [];
        });
        setIsProcessing(false);
        setStreamingContent("");
        setPendingQuestion(null);
        void queryClient.invalidateQueries({ queryKey: desktopQueryKeys.messages(selectedConversationId) }).catch(() => undefined);
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
      const inputTokens = (evt.metadata as Record<string, number>).input_tokens ?? 0;
      const outputTokens = (evt.metadata as Record<string, number>).output_tokens ?? 0;
      const cacheReadTokens = (evt.metadata as Record<string, number>).cache_read_tokens ?? 0;
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
      if (isActiveSession && selectedConversationId) {
        setStreamingSteps((prev) => {
          if (prev.length > 0) {
            completedStepsRef.current.set(selectedConversationId, finalizeSteps(prev));
          }
          return [];
        });
        setIsProcessing(false);
        setStreamingContent("");
        setPendingQuestion(null);
        setError(formatStreamingError(evt.content));
        void queryClient.invalidateQueries({ queryKey: desktopQueryKeys.messages(selectedConversationId) }).catch(() => undefined);
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
  });
}
