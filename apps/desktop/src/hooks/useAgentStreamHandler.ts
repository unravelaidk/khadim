import { useEffectEvent } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { AgentStreamEvent, PendingApproval, PendingQuestion, QuestionItem, QuestionOption, ThinkingStepData } from "../lib/bindings";
import { desktopQueryKeys } from "../lib/queries";
import { stripInternalReminderBlocks } from "../lib/streaming";
import type { AgentInstance, LocalChatConversation, LocalChatMessage } from "../lib/types";
import { createLocalMessage } from "../lib/types";

function normalizeQuestionOption(value: unknown): QuestionOption | null {
  if (typeof value === "string") {
    const label = value.trim();
    return label ? { label, description: "" } : null;
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const label = typeof record.label === "string"
    ? record.label.trim()
    : typeof record.value === "string"
      ? record.value.trim()
      : "";
  if (!label) return null;

  return {
    label,
    description: typeof record.description === "string" ? record.description : "",
  };
}

function normalizeQuestionItem(value: unknown): QuestionItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const question = typeof record.question === "string"
    ? record.question.trim()
    : typeof record.prompt === "string"
      ? record.prompt.trim()
      : typeof record.text === "string"
        ? record.text.trim()
        : "";
  if (!question) return null;

  const header = typeof record.header === "string" && record.header.trim()
    ? record.header.trim()
    : typeof record.title === "string" && record.title.trim()
      ? record.title.trim()
      : "Question";

  const rawOptions = Array.isArray(record.options)
    ? record.options
    : Array.isArray(record.choices)
      ? record.choices
      : [];
  const options = rawOptions
    .map((option) => normalizeQuestionOption(option))
    .filter((option): option is QuestionOption => option != null);

  return {
    header,
    question,
    options,
    multiple: record.multiple === true,
    custom: typeof record.custom === "boolean" ? record.custom : true,
  };
}

function normalizeQuestionPayload(value: unknown): QuestionItem[] {
  const items = Array.isArray(value) ? value : value != null ? [value] : [];
  return items
    .map((item) => normalizeQuestionItem(item))
    .filter((item): item is QuestionItem => item != null);
}

interface UseAgentStreamHandlerArgs {
  queryClient: QueryClient;
  selectedWorkspaceId: string | null;
  selectedWorkspaceBackend: string | null;
  selectedConversationId: string | null;
  activeConversationBackendSessionId: string | null;
  activeConversationId: string | null;
  agents: AgentInstance[];
  setPendingQuestion: Dispatch<SetStateAction<PendingQuestion | null>>;
  setPendingApproval: Dispatch<SetStateAction<PendingApproval | null>>;
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
  selectedWorkspaceBackend,
  selectedConversationId,
  activeConversationBackendSessionId,
  activeConversationId,
  agents,
  setPendingQuestion,
  setPendingApproval,
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
          const nextContent = stripInternalReminderBlocks(conversation.streamingContent + evt.content);
          return {
            ...conversation,
            isProcessing: true,
            streamingContent: nextContent,
          };
        }));

        if (chatActiveConvIdRef.current === standaloneConversation?.id) {
          chatStreamingContentRef.current = stripInternalReminderBlocks(chatStreamingContentRef.current + evt.content);
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
      } else if (evt.event_type === "question" && evt.metadata) {
        const meta = evt.metadata as Record<string, unknown>;
        const id = typeof meta.id === "string" ? meta.id : "";
        const questions = normalizeQuestionPayload(meta.questions);
        if (id && questions.length > 0) {
          setPendingQuestion({
            id,
            sessionId: evt.session_id,
            workspaceId: evt.workspace_id,
            conversationId: standaloneConversation?.id ?? null,
            backend: "khadim",
            questions,
          });
        } else {
          console.warn("Received malformed question event", evt);
        }
      } else if (evt.event_type === "done" || evt.event_type === "error") {
        if (evt.event_type === "done" && chatErroredSessionsRef.current.has(evt.session_id)) {
          chatErroredSessionsRef.current.delete(evt.session_id);
          return;
        }
        if (evt.event_type === "error") {
          chatErroredSessionsRef.current.add(evt.session_id);
        }

        const finalContent = stripInternalReminderBlocks(standaloneConversation?.streamingContent ?? "");
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

        void Promise.all([
          queryClient.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores }),
          queryClient.invalidateQueries({ queryKey: desktopQueryKeys.chatMemoryStore(null) }),
          queryClient.invalidateQueries({ queryKey: ["memory-entries"] }),
        ]).catch(() => undefined);
      }
      return;
    }

    if (evt.workspace_id !== selectedWorkspaceId) return;

    const isActiveSession = activeConversationBackendSessionId != null
      && evt.session_id === activeConversationBackendSessionId;

    if (evt.event_type === "text_delta" && evt.content) {
      erroredAgentSessionsRef.current.delete(evt.session_id);
      if (isActiveSession) {
        setStreamingContent((prev) => stripInternalReminderBlocks(prev + evt.content));
      }

      setAgents((prev) => {
        let changed = false;
        const next = prev.map((agent) => {
          if (agent.sessionId !== evt.session_id) return agent;
          changed = true;
          const newContent = stripInternalReminderBlocks(agent.streamingContent + evt.content);
          return {
            ...agent,
            streamingContent: newContent,
            streamPreview: extractStreamPreview(newContent),
            status: "running" as const,
            currentActivity: agent.currentActivity === "Starting..." ? "Streaming..." : agent.currentActivity,
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
    } else if (evt.event_type === "question" && evt.metadata) {
      const meta = evt.metadata as Record<string, unknown>;
      const id = typeof meta.id === "string" ? meta.id : "";
      const questions = normalizeQuestionPayload(meta.questions);
      const matchedAgent = agents.find((agent) => agent.sessionId === evt.session_id);
      if (id && questions.length > 0 && selectedWorkspaceBackend) {
        setPendingQuestion({
          id,
          sessionId: evt.session_id,
          workspaceId: evt.workspace_id,
          conversationId: matchedAgent?.id ?? (isActiveSession ? selectedConversationId : null),
          backend: selectedWorkspaceBackend === "khadim" ? "khadim" : "opencode",
          questions,
        });
      } else {
        console.warn("Received malformed question event", evt);
      }

      setAgents((prev) => {
        let changed = false;
        const next = prev.map((agent) => {
          if (agent.sessionId !== evt.session_id) return agent;
          changed = true;
          return {
            ...agent,
            status: "running" as const,
            currentActivity: "Waiting for your input",
          };
        });
        return changed ? next : prev;
      });
    } else if (evt.event_type === "permission_request" && evt.metadata) {
      const meta = evt.metadata as Record<string, unknown>;
      const id = typeof meta.id === "string" ? meta.id : "";
      const toolName = typeof meta.toolName === "string" ? meta.toolName : "tool";
      const displayName = typeof meta.displayName === "string" ? meta.displayName : toolName;
      const title = typeof meta.title === "string" ? meta.title : `Approve ${displayName}`;
      const description = typeof meta.description === "string" ? meta.description : "";
      const blockedPath = typeof meta.blockedPath === "string" ? meta.blockedPath : null;
      const canRemember = meta.canRemember === true;
      const matchedAgent = agents.find((agent) => agent.sessionId === evt.session_id);

      if (id) {
        setPendingApproval({
          id,
          sessionId: evt.session_id,
          workspaceId: evt.workspace_id,
          conversationId: matchedAgent?.id ?? (isActiveSession ? selectedConversationId : null),
          backend: "claude_code",
          toolName,
          displayName,
          title,
          description,
          blockedPath,
          canRemember,
          input: meta.input && typeof meta.input === "object" ? meta.input as Record<string, unknown> : null,
        });
      } else {
        console.warn("Received malformed permission request event", evt);
      }

      setAgents((prev) => {
        let changed = false;
        const next = prev.map((agent) => {
          if (agent.sessionId !== evt.session_id) return agent;
          changed = true;
          return {
            ...agent,
            status: "running" as const,
            currentActivity: "Waiting for approval",
          };
        });
        return changed ? next : prev;
      });
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
        setPendingApproval(null);
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

      void Promise.all([
        queryClient.invalidateQueries({ queryKey: desktopQueryKeys.memoryStores }),
        queryClient.invalidateQueries({ queryKey: desktopQueryKeys.workspaceMemoryStores(selectedWorkspaceId) }),
        queryClient.invalidateQueries({ queryKey: ["memory-entries"] }),
      ]).catch(() => undefined);
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
        setPendingApproval(null);
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
