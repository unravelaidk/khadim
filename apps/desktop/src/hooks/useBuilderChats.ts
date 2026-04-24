import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands, events } from "../lib/bindings";
import type {
  AgentStreamEvent,
  PendingQuestion,
  QuestionItem,
  QuestionOption,
  ThinkingStepData,
} from "../lib/bindings";
import type { BuilderChat, LocalChatMessage } from "../lib/types";
import { createBuilderChat } from "../lib/types";
import { useSettingQuery } from "../lib/queries";
import {
  applyStreamingStepEvent,
  finalizeSteps,
  stripInternalReminderBlocks,
} from "../lib/streaming";

/* ═══════════════════════════════════════════════════════════════════════
   useBuilderChats — persists Agent Builder "drafts" to the settings KV,
   and owns the live stream listener so events are captured regardless of
   whether the AgentBuilderPanel is currently mounted. A draft's `done`
   event always lands in the persisted chat, even if the user navigated
   away mid-response.
   ═══════════════════════════════════════════════════════════════════════ */

const BUILDER_CHATS_KEY = "khadim:builder_chats";
const BUILDER_WORKSPACE_ID = "__agent_builder__";

export interface BuilderStreamState {
  isProcessing: boolean;
  streamingContent: string;
  streamingSteps: ThinkingStepData[];
}

const EMPTY_STREAM: BuilderStreamState = {
  isProcessing: false,
  streamingContent: "",
  streamingSteps: [],
};

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

function finalizePersistedSteps(steps: ThinkingStepData[]): ThinkingStepData[] {
  return steps.map((step) =>
    step.status === "running" ? { ...step, status: "complete" as const } : step,
  );
}

function restoreMessage(value: unknown): LocalChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const msg = value as Partial<LocalChatMessage>;
  if (msg.role !== "user" && msg.role !== "assistant") return null;
  if (typeof msg.content !== "string") return null;
  return {
    id: typeof msg.id === "string" && msg.id ? msg.id : crypto.randomUUID(),
    role: msg.role,
    content: msg.content,
    createdAt:
      typeof msg.createdAt === "string" && msg.createdAt
        ? msg.createdAt
        : new Date().toISOString(),
    thinkingSteps: Array.isArray(msg.thinkingSteps)
      ? finalizePersistedSteps(
          msg.thinkingSteps.filter(
            (step): step is ThinkingStepData => Boolean(step && typeof step === "object"),
          ),
        )
      : undefined,
  };
}

function restoreChat(value: unknown): BuilderChat | null {
  if (!value || typeof value !== "object") return null;
  const chat = value as Partial<BuilderChat>;
  if (typeof chat.id !== "string" || !chat.id) return null;

  const messages = Array.isArray(chat.messages)
    ? chat.messages
        .map(restoreMessage)
        .filter((m): m is LocalChatMessage => m !== null)
    : [];

  // If the app closed mid-stream, persist whatever partial content we had
  // captured as an "interrupted" assistant message so the user keeps it.
  const partialContent =
    typeof chat.streamingContent === "string" ? chat.streamingContent.trim() : "";
  const partialSteps = Array.isArray(chat.streamingSteps)
    ? finalizePersistedSteps(
        chat.streamingSteps.filter(
          (step): step is ThinkingStepData => Boolean(step && typeof step === "object"),
        ),
      )
    : [];
  if (partialContent || partialSteps.length > 0) {
    messages.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content: partialContent ? `${partialContent}\n\n⏸ Interrupted.` : "⏸ Interrupted.",
      createdAt: new Date().toISOString(),
      thinkingSteps: partialSteps.length > 0 ? partialSteps : undefined,
    });
  }

  const now = new Date().toISOString();
  return {
    id: chat.id,
    title: typeof chat.title === "string" && chat.title ? chat.title : "New draft",
    seedMessage:
      typeof chat.seedMessage === "string" && chat.seedMessage.trim()
        ? chat.seedMessage
        : null,
    messages,
    // Don't restore an in-flight session — the stream is gone.
    sessionId: null,
    savedAgentId:
      typeof chat.savedAgentId === "string" && chat.savedAgentId ? chat.savedAgentId : null,
    savedAgentName:
      typeof chat.savedAgentName === "string" && chat.savedAgentName
        ? chat.savedAgentName
        : null,
    createdAt:
      typeof chat.createdAt === "string" && chat.createdAt ? chat.createdAt : now,
    updatedAt:
      typeof chat.updatedAt === "string" && chat.updatedAt ? chat.updatedAt : now,
  };
}

function restoreBuilderState(raw: string | null | undefined): {
  chats: BuilderChat[];
  staleIds: string[];
} {
  if (!raw) return { chats: [], staleIds: [] };
  try {
    const parsed = JSON.parse(raw) as { chats?: unknown[] };
    const rawChats = Array.isArray(parsed.chats) ? parsed.chats : [];
    const staleIds: string[] = [];
    const chats: BuilderChat[] = [];
    for (const raw of rawChats) {
      const restored = restoreChat(raw);
      if (!restored) continue;
      const originalSessionId =
        raw && typeof raw === "object" && "sessionId" in raw
          ? (raw as { sessionId?: unknown }).sessionId
          : null;
      if (typeof originalSessionId === "string" && originalSessionId.length > 0) {
        staleIds.push(restored.id);
      }
      chats.push(restored);
    }
    return { chats, staleIds };
  } catch {
    return { chats: [], staleIds: [] };
  }
}

function serializeBuilderState(chats: BuilderChat[]): string {
  return JSON.stringify({ chats });
}

/** Lightweight read-only hook — returns the current draft count without
 *  mounting the full controller. Safe to use alongside useBuilderChats. */
export function useBuilderChatCount(): number {
  const stateQuery = useSettingQuery(BUILDER_CHATS_KEY);
  return useMemo(() => {
    const restored = restoreBuilderState(stateQuery.data);
    return restored.chats.length;
  }, [stateQuery.data]);
}

export interface BuilderChatsController {
  chats: BuilderChat[];
  activeId: string | null;
  activeChat: BuilderChat | null;
  setActiveId: (id: string | null) => void;
  /** Create a new draft (optionally pre-seeded with a prompt) and activate it. */
  newChat: (seed?: string | null) => BuilderChat;
  /** Shallow-merge a partial into the chat with `id`. Always bumps updatedAt. */
  updateChat: (id: string, partial: Partial<BuilderChat>) => void;
  deleteChat: (id: string) => void;
  hydrated: boolean;
  /** True if this draft's previous session was lost on app restart. */
  isStale: (id: string) => boolean;
  /** Clear the stale flag (call once the user dismisses the notice). */
  dismissStale: (id: string) => void;
  /** Live streaming state for a draft, or an empty default. */
  getStream: (id: string) => BuilderStreamState;
  /** Mark a draft as actively sending (used before the first stream event). */
  markSending: (id: string, sessionId: string) => void;
  /** Pending question for a draft, if the builder asked for input. */
  getPendingQuestion: (id: string) => PendingQuestion | null;
  answerQuestion: (id: string, answers: string[][]) => Promise<void>;
  dismissQuestion: (id: string) => Promise<void>;
  /** Abort the active in-flight stream for a draft and finalize its state. */
  abortChat: (id: string) => Promise<void>;
}

export function useBuilderChats(): BuilderChatsController {
  const [chats, setChats] = useState<BuilderChat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [staleIds, setStaleIds] = useState<Set<string>>(() => new Set());
  const [streams, setStreams] = useState<Record<string, BuilderStreamState>>({});
  const [pendingQuestions, setPendingQuestions] = useState<Record<string, PendingQuestion>>({});
  const stateQuery = useSettingQuery(BUILDER_CHATS_KEY);
  const hydratedRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  // Refs mirror the latest state so the stream listener (mounted once) can
  // reach current values without being recreated on every render.
  const chatsRef = useRef<BuilderChat[]>([]);
  const streamsRef = useRef<Record<string, BuilderStreamState>>({});
  // Synchronously-updated map from sessionId → chatId. markSending writes
  // this immediately so the first stream events can be routed even before
  // the `chats` state update commits and chatsRef catches up.
  const sessionToChatRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    chatsRef.current = chats;
    // Reconcile the session map with the latest chats — handles deletes,
    // session resets, and hydration restores.
    const next = new Map<string, string>();
    for (const c of chats) {
      if (c.sessionId) next.set(c.sessionId, c.id);
    }
    sessionToChatRef.current = next;
  }, [chats]);
  useEffect(() => {
    streamsRef.current = streams;
  }, [streams]);

  // ── Hydrate once ──────────────────────────────────────────────────
  useEffect(() => {
    if (hydratedRef.current || stateQuery.isLoading) return;
    hydratedRef.current = true;
    const restored = restoreBuilderState(stateQuery.data);
    setChats(restored.chats);
    setStaleIds(new Set(restored.staleIds));
    setHydrated(true);
  }, [stateQuery.data, stateQuery.isLoading]);

  // ── Debounced persistence ─────────────────────────────────────────
  const serialized = useMemo(
    () => serializeBuilderState(chats),
    [chats],
  );

  useEffect(() => {
    if (!hydratedRef.current) return;
    const timeout = window.setTimeout(() => {
      void commands.setSetting(BUILDER_CHATS_KEY, serialized).catch(() => undefined);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [serialized]);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeId) ?? null,
    [chats, activeId],
  );

  const newChat = useCallback((seed?: string | null): BuilderChat => {
    const chat = createBuilderChat(seed ?? null);
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
    return chat;
  }, []);

  const updateChat = useCallback((id: string, partial: Partial<BuilderChat>) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, ...partial, updatedAt: new Date().toISOString() }
          : c,
      ),
    );
  }, []);

  const deleteChat = useCallback((id: string) => {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      setActiveId((current) => (current === id ? null : current));
      return next;
    });
    setStaleIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setStreams((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPendingQuestions((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const isStale = useCallback((id: string) => staleIds.has(id), [staleIds]);

  const dismissStale = useCallback((id: string) => {
    setStaleIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const getStream = useCallback(
    (id: string): BuilderStreamState => streams[id] ?? EMPTY_STREAM,
    [streams],
  );

  const getPendingQuestion = useCallback(
    (id: string): PendingQuestion | null => pendingQuestions[id] ?? null,
    [pendingQuestions],
  );

  const markSending = useCallback((id: string, sessionId: string) => {
    const nextSessionId = sessionId.trim();
    const now = new Date().toISOString();
    if (!nextSessionId) {
      setStreams((prev) => ({
        ...prev,
        [id]: { ...EMPTY_STREAM },
      }));
      return;
    }

    // Update the session→chat map synchronously so the global stream
    // listener can route events that arrive before setChats commits.
    sessionToChatRef.current.set(nextSessionId, id);

    setStreams((prev) => ({
      ...prev,
      [id]: {
        isProcessing: true,
        streamingContent: "",
        streamingSteps: [],
      },
    }));
    // Ensure the chat records the sessionId so future events can be routed.
    setChats((prev) =>
      prev.map((c) =>
        c.id === id && c.sessionId !== nextSessionId
          ? { ...c, sessionId: nextSessionId, updatedAt: now }
          : c.id === id
            ? { ...c, updatedAt: now }
            : c,
      ),
    );
  }, []);

  // ── Global stream listener ────────────────────────────────────────
  // Mounted once for the lifetime of the Work view. Routes events by
  // sessionId → chatId so a draft in flight is always finalized, even
  // if the AgentBuilderPanel was unmounted by navigation.
  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;

    const findChatIdBySession = (sessionId: string | null): string | null => {
      if (!sessionId) return null;
      // Prefer the synchronous map (markSending updates it before any
      // stream events can arrive); fall back to the chats array for
      // restored/hydrated sessions.
      const fromMap = sessionToChatRef.current.get(sessionId);
      if (fromMap) return fromMap;
      const chat = chatsRef.current.find((c) => c.sessionId === sessionId);
      return chat ? chat.id : null;
    };

    const applyToStream = (
      chatId: string,
      mutate: (prev: BuilderStreamState) => BuilderStreamState,
    ) => {
      setStreams((prev) => {
        const current = prev[chatId] ?? EMPTY_STREAM;
        const next = mutate(current);
        if (next === current) return prev;
        return { ...prev, [chatId]: next };
      });
    };

    const finalizeAssistantMessage = (
      chatId: string,
      content: string,
      steps: ThinkingStepData[],
    ) => {
      if (!content.trim() && steps.length === 0) return;
      const assistantMessage: LocalChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
        thinkingSteps: steps.length > 0 ? steps : undefined,
      };
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: [...c.messages, assistantMessage],
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
      );
    };

    /** Mirror the in-memory stream into the chat so partial progress survives
     *  an app restart. Called after each text_delta / step event. */
    const syncStreamIntoChat = (
      chatId: string,
      streamingContent: string,
      streamingSteps: ThinkingStepData[],
    ) => {
      const now = new Date().toISOString();
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, streamingContent, streamingSteps, updatedAt: now }
            : c,
        ),
      );
    };

    /** Clear the persisted partial stream — call on done/error/abort. */
    const clearChatStream = (chatId: string) => {
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId && (c.streamingContent || c.streamingSteps)
            ? { ...c, streamingContent: undefined, streamingSteps: undefined }
            : c,
        ),
      );
    };

    void events
      .onAgentStream((evt: AgentStreamEvent) => {
        if (!alive) return;
        // Only handle builder workspace events.
        if (evt.workspace_id !== BUILDER_WORKSPACE_ID) return;
        const chatId = findChatIdBySession(evt.session_id);
        if (!chatId) return;

        if (evt.event_type === "text_delta" && evt.content) {
          applyToStream(chatId, (prev) => {
            const next = {
              ...prev,
              isProcessing: true,
              streamingContent: stripInternalReminderBlocks(
                prev.streamingContent + evt.content,
              ),
            };
            syncStreamIntoChat(chatId, next.streamingContent, next.streamingSteps);
            return next;
          });
          return;
        }

        if (
          evt.event_type === "step_start" ||
          evt.event_type === "step_update" ||
          evt.event_type === "step_complete"
        ) {
          applyToStream(chatId, (prev) => {
            const next = {
              ...prev,
              isProcessing: true,
              streamingSteps: applyStreamingStepEvent(prev.streamingSteps, evt),
            };
            syncStreamIntoChat(chatId, next.streamingContent, next.streamingSteps);
            return next;
          });
          return;
        }

        if (evt.event_type === "question" && evt.metadata) {
          const meta = evt.metadata as Record<string, unknown>;
          const id = typeof meta.id === "string" ? meta.id : "";
          const questions = normalizeQuestionPayload(meta.questions);
          if (!id || questions.length === 0) return;
          setPendingQuestions((prev) => ({
            ...prev,
            [chatId]: {
              id,
              sessionId: evt.session_id,
              workspaceId: evt.workspace_id,
              conversationId: chatId,
              backend: "khadim",
              questions,
            },
          }));
          return;
        }

        if (evt.event_type === "done") {
          const live = streamsRef.current[chatId] ?? EMPTY_STREAM;
          const finalText = stripInternalReminderBlocks(live.streamingContent);
          const finalSteps = finalizeSteps(live.streamingSteps);
          finalizeAssistantMessage(chatId, finalText, finalSteps);
          clearChatStream(chatId);
          setPendingQuestions((prev) => {
            if (!(chatId in prev)) return prev;
            const next = { ...prev };
            delete next[chatId];
            return next;
          });
          applyToStream(chatId, () => ({ ...EMPTY_STREAM }));
          return;
        }

        if (evt.event_type === "error") {
          const live = streamsRef.current[chatId] ?? EMPTY_STREAM;
          const tail = evt.content
            ? `\n\n⚠️ ${evt.content}`
            : "\n\n⚠️ Something went wrong.";
          const finalText = stripInternalReminderBlocks(live.streamingContent) + tail;
          const finalSteps = finalizeSteps(live.streamingSteps);
          finalizeAssistantMessage(chatId, finalText, finalSteps);
          clearChatStream(chatId);
          setPendingQuestions((prev) => {
            if (!(chatId in prev)) return prev;
            const next = { ...prev };
            delete next[chatId];
            return next;
          });
          applyToStream(chatId, () => ({ ...EMPTY_STREAM }));
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  const answerQuestion = useCallback(async (id: string, answers: string[][]) => {
    const pending = pendingQuestions[id];
    if (!pending) return;
    const reply = answers
      .flatMap((group) => group.map((value) => value.trim()).filter(Boolean))
      .join("\n");
    if (!reply) return;
    await commands.khadimAnswerQuestion(pending.sessionId, reply);
    setPendingQuestions((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [pendingQuestions]);

  const dismissQuestion = useCallback(async (id: string) => {
    await answerQuestion(id, [["(skipped)"]]);
  }, [answerQuestion]);

  const abortChat = useCallback(async (id: string) => {
    const chat = chatsRef.current.find((c) => c.id === id);
    const sessionId = chat?.sessionId ?? null;
    if (sessionId) {
      await commands.khadimAbort(sessionId).catch(() => undefined);
    }

    // Finalize whatever streamed so far into a message, then reset state.
    // The backend task is killed, so no "done" event will arrive.
    const live = streamsRef.current[id] ?? EMPTY_STREAM;
    const partialText = stripInternalReminderBlocks(live.streamingContent).trim();
    const finalSteps = finalizeSteps(live.streamingSteps);
    const tail = partialText ? "\n\n⏹ Stopped." : "⏹ Stopped.";
    const content = partialText ? `${partialText}${tail}` : tail;
    const assistantMessage: LocalChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
      thinkingSteps: finalSteps.length > 0 ? finalSteps : undefined,
    };
    setChats((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              messages: [...c.messages, assistantMessage],
              sessionId: null,
              streamingContent: undefined,
              streamingSteps: undefined,
              updatedAt: new Date().toISOString(),
            }
          : c,
      ),
    );
    if (sessionId) sessionToChatRef.current.delete(sessionId);
    setStreams((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      next[id] = { ...EMPTY_STREAM };
      return next;
    });
    setPendingQuestions((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return {
    chats,
    activeId,
    activeChat,
    setActiveId,
    newChat,
    updateChat,
    deleteChat,
    hydrated,
    isStale,
    dismissStale,
    getStream,
    markSending,
    getPendingQuestion,
    answerQuestion,
    dismissQuestion,
    abortChat,
  };
}
