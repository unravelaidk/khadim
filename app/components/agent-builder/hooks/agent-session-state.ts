import type { Message, PendingQuestion, ThinkingStepData } from "../../../types/chat";

export type ActiveAgentState = { mode: "plan" | "build"; name: string } | null;

export interface StreamEvent {
  type: string;
  jobId?: string;
  chatId?: string;
  sessionId?: string;
  id?: number | string;
  eventId?: string;
  sequence?: number;
  snapshotEventId?: string;
  snapshotSequence?: number;
  [key: string]: unknown;
}

export interface JobSnapshot {
  id: string;
  chatId: string;
  sessionId: string;
  status: "running" | "completed" | "error" | "cancelled";
  steps: Message["thinkingSteps"];
  finalContent: string;
  previewUrl: string | null;
  fileContent?: string;
  sandboxId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionSnapshotEvent {
  sessionId: string;
  snapshotEventId?: string;
  snapshotSequence?: number;
  jobs: JobSnapshot[];
  updatedAt: string;
}

interface ChatSessionState {
  messagesById: Record<string, Message>;
  messageOrder: string[];
  sandboxId: string | null;
  activeJobIds: string[];
  pendingQuestion: PendingQuestion | null;
  activeAgent: ActiveAgentState;
}

export interface AgentSessionState {
  chats: Record<string, ChatSessionState>;
  jobMessageIds: Record<string, string>;
  jobChatKeys: Record<string, string>;
  pendingAssistantMessageIdsByChat: Record<string, string[]>;
  lastAppliedEventId: string | null;
  lastSnapshotEventId: string | null;
  lastAppliedSequence: number;
  lastSnapshotSequence: number;
}

export interface ChatRuntimeView {
  messages: Message[];
  sandboxId: string | null;
  activeJobIds: string[];
  pendingQuestion: PendingQuestion | null;
  activeAgent: ActiveAgentState;
}

export interface SlideRuntimeView {
  content: string | null;
  isStreaming: boolean;
  isBuilding: boolean;
}

export const DRAFT_CHAT_KEY = "__draft__";

function createEmptyChatState(): ChatSessionState {
  return {
    messagesById: {},
    messageOrder: [],
    sandboxId: null,
    activeJobIds: [],
    pendingQuestion: null,
    activeAgent: null,
  };
}

export function createEmptyAgentSessionState(): AgentSessionState {
  return {
    chats: {},
    jobMessageIds: {},
    jobChatKeys: {},
    pendingAssistantMessageIdsByChat: {},
    lastAppliedEventId: null,
    lastSnapshotEventId: null,
    lastAppliedSequence: 0,
    lastSnapshotSequence: 0,
  };
}

function compareStreamIds(left: string, right: string): number {
  const [leftMs = "0", leftSeq = "0"] = left.split("-");
  const [rightMs = "0", rightSeq = "0"] = right.split("-");
  const msDiff = Number.parseInt(leftMs, 10) - Number.parseInt(rightMs, 10);
  if (msDiff !== 0) {
    return msDiff;
  }
  return Number.parseInt(leftSeq, 10) - Number.parseInt(rightSeq, 10);
}

function isStaleEvent(state: AgentSessionState, event: Pick<StreamEvent, "eventId" | "sequence">): boolean {
  if (typeof event.sequence === "number") {
    return event.sequence <= state.lastAppliedSequence;
  }
  if (!event.eventId || !state.lastAppliedEventId) {
    return false;
  }
  return compareStreamIds(event.eventId, state.lastAppliedEventId) <= 0;
}

function withAppliedEventMeta(state: AgentSessionState, event: Pick<StreamEvent, "eventId" | "sequence">): AgentSessionState {
  let nextState = state;

  if (typeof event.sequence === "number" && event.sequence > state.lastAppliedSequence) {
    nextState = {
      ...nextState,
      lastAppliedSequence: event.sequence,
    };
  }

  if (!event.eventId) {
    return nextState;
  }

  if (nextState.lastAppliedEventId && compareStreamIds(event.eventId, nextState.lastAppliedEventId) <= 0) {
    return nextState;
  }

  return {
    ...nextState,
    lastAppliedEventId: event.eventId,
  };
}

function withSnapshotEventMeta(
  state: AgentSessionState,
  snapshot: { snapshotEventId?: string; snapshotSequence?: number },
): AgentSessionState {
  let nextState = state;
  if (typeof snapshot.snapshotSequence === "number" && snapshot.snapshotSequence > state.lastSnapshotSequence) {
    nextState = {
      ...nextState,
      lastSnapshotSequence: snapshot.snapshotSequence,
    };
  }

  if (!snapshot.snapshotEventId) {
    return withAppliedEventMeta(nextState, {
      eventId: undefined,
      sequence: snapshot.snapshotSequence,
    });
  }

  if (nextState.lastSnapshotEventId && compareStreamIds(snapshot.snapshotEventId, nextState.lastSnapshotEventId) <= 0) {
    return withAppliedEventMeta(nextState, {
      eventId: snapshot.snapshotEventId,
      sequence: snapshot.snapshotSequence,
    });
  }

  return withAppliedEventMeta({
    ...state,
    lastSnapshotEventId: snapshot.snapshotEventId,
    lastSnapshotSequence: typeof snapshot.snapshotSequence === "number" ? snapshot.snapshotSequence : state.lastSnapshotSequence,
  }, {
    eventId: snapshot.snapshotEventId,
    sequence: snapshot.snapshotSequence,
  });
}

export function getChatStateKey(chatId: string | null | undefined): string {
  return chatId || DRAFT_CHAT_KEY;
}

function getChat(state: AgentSessionState, chatKey: string): ChatSessionState {
  return state.chats[chatKey] || createEmptyChatState();
}

function updateChat(
  state: AgentSessionState,
  chatKey: string,
  updater: (chat: ChatSessionState) => ChatSessionState,
): AgentSessionState {
  const current = getChat(state, chatKey);
  const nextChat = updater(current);
  if (nextChat === current) {
    return state;
  }

  return {
    ...state,
    chats: {
      ...state.chats,
      [chatKey]: nextChat,
    },
  };
}

function upsertMessages(chat: ChatSessionState, messages: Message[]): ChatSessionState {
  let messagesById = chat.messagesById;
  let messageOrder = chat.messageOrder;

  for (const message of messages) {
    const existing = messagesById[message.id];
    if (!existing) {
      if (messagesById === chat.messagesById) {
        messagesById = { ...chat.messagesById };
      }
      if (messageOrder === chat.messageOrder) {
        messageOrder = [...chat.messageOrder];
      }
      messagesById[message.id] = message;
      messageOrder.push(message.id);
      continue;
    }

    if (messagesById === chat.messagesById) {
      messagesById = { ...chat.messagesById };
    }
    messagesById[message.id] = message;
  }

  if (messagesById === chat.messagesById && messageOrder === chat.messageOrder) {
    return chat;
  }

  return {
    ...chat,
    messagesById,
    messageOrder,
  };
}

function updateMessage(chat: ChatSessionState, messageId: string, updater: (message: Message) => Message): ChatSessionState {
  const current = chat.messagesById[messageId];
  if (!current) {
    return chat;
  }

  const next = updater(current);
  if (next === current) {
    return chat;
  }

  return {
    ...chat,
    messagesById: {
      ...chat.messagesById,
      [messageId]: next,
    },
  };
}

function removeMessage(chat: ChatSessionState, messageId: string): ChatSessionState {
  if (!chat.messagesById[messageId]) {
    return chat;
  }

  const { [messageId]: _removed, ...messagesById } = chat.messagesById;
  return {
    ...chat,
    messagesById,
    messageOrder: chat.messageOrder.filter((id) => id !== messageId),
  };
}

export function selectChatRuntime(state: AgentSessionState, chatId: string | null | undefined): ChatRuntimeView {
  const chat = getChat(state, getChatStateKey(chatId));
  return {
    messages: chat.messageOrder.map((id) => chat.messagesById[id]).filter((message): message is Message => !!message),
    sandboxId: chat.sandboxId,
    activeJobIds: chat.activeJobIds,
    pendingQuestion: chat.pendingQuestion,
    activeAgent: chat.activeAgent,
  };
}

export function selectSlideRuntime(
  state: AgentSessionState,
  chatId: string | null | undefined,
  isProcessing: boolean,
): SlideRuntimeView | null {
  const { messages } = selectChatRuntime(state, chatId);
  let latestContent: string | null = null;
  let isStreaming = false;
  let isBuilding = false;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "assistant" && message.fileContent?.includes('<script id="slide-data"')) {
      latestContent = message.fileContent;
      isStreaming = (message.thinkingSteps || []).some((step) => step.status === "running");
      break;
    }
  }

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (lastAssistant) {
    const hasRunningSteps = (lastAssistant.thinkingSteps || []).some((step) => step.status === "running");
    if (hasRunningSteps) {
      const hasSlideToolRunning = (lastAssistant.thinkingSteps || []).some(
        (step) =>
          step.status === "running" &&
          (step.tool === "write_slides" || (step.tool === "write_file" && step.filename === "index.html")),
      );
      if (hasSlideToolRunning || latestContent) {
        isBuilding = true;
      }
    }
  }

  if (isProcessing && latestContent) {
    isBuilding = true;
  }

  if (!latestContent && !isBuilding) {
    return null;
  }

  return { content: latestContent, isStreaming, isBuilding };
}

export function registerPendingAssistantMessage(state: AgentSessionState, chatKey: string, messageId: string): AgentSessionState {
  return {
    ...state,
    pendingAssistantMessageIdsByChat: {
      ...state.pendingAssistantMessageIdsByChat,
      [chatKey]: [...(state.pendingAssistantMessageIdsByChat[chatKey] || []), messageId],
    },
  };
}

export function resolvePendingAssistantMessage(state: AgentSessionState, chatKey: string, messageId: string): AgentSessionState {
  const pending = state.pendingAssistantMessageIdsByChat[chatKey];
  if (!pending) {
    return state;
  }

  const nextPending = pending.filter((pendingMessageId) => pendingMessageId !== messageId);
  const nextPendingByChat = { ...state.pendingAssistantMessageIdsByChat };
  if (nextPending.length === 0) {
    delete nextPendingByChat[chatKey];
  } else {
    nextPendingByChat[chatKey] = nextPending;
  }

  return {
    ...state,
    pendingAssistantMessageIdsByChat: nextPendingByChat,
  };
}

export function appendMessages(state: AgentSessionState, chatKey: string, messages: Message[]): AgentSessionState {
  return updateChat(state, chatKey, (chat) => upsertMessages(chat, messages));
}

export function updateMessageById(
  state: AgentSessionState,
  chatKey: string,
  messageId: string,
  updater: (message: Message) => Message,
): AgentSessionState {
  return updateChat(state, chatKey, (chat) => updateMessage(chat, messageId, updater));
}

export function setChatMeta(
  state: AgentSessionState,
  chatKey: string,
  updates: Partial<Pick<ChatSessionState, "sandboxId" | "pendingQuestion" | "activeAgent" | "activeJobIds">>,
): AgentSessionState {
  return updateChat(state, chatKey, (chat) => ({ ...chat, ...updates }));
}

export function replaceChatKey(state: AgentSessionState, fromKey: string, toKey: string): AgentSessionState {
  if (fromKey === toKey) {
    return state;
  }

  const fromChat = state.chats[fromKey];
  if (!fromChat) {
    return state;
  }

  const toChat = getChat(state, toKey);

  // Merge messages from both chats. The source (fromChat) provides the
  // primary message list, but the target (toChat) may already contain
  // messages created by stream events that arrived before the rename
  // (e.g. fallback messages like `job-<id>`). We must preserve those
  // so accumulated tool-step data is not lost.
  let mergedMessagesById: Record<string, Message>;
  let mergedMessageOrder: string[];

  if (fromChat.messageOrder.length > 0) {
    // Start with all target messages (may include fallback step messages)
    mergedMessagesById = { ...toChat.messagesById, ...fromChat.messagesById };
    // Keep the source order, then append any target-only messages
    const fromIdSet = new Set(fromChat.messageOrder);
    const extraIds = toChat.messageOrder.filter((id) => !fromIdSet.has(id));
    mergedMessageOrder = [...fromChat.messageOrder, ...extraIds];
  } else {
    mergedMessagesById = toChat.messagesById;
    mergedMessageOrder = toChat.messageOrder;
  }

  let nextState = updateChat(state, toKey, () => ({
    ...toChat,
    messagesById: mergedMessagesById,
    messageOrder: mergedMessageOrder,
    sandboxId: fromChat.sandboxId || toChat.sandboxId,
    activeJobIds: Array.from(new Set([...toChat.activeJobIds, ...fromChat.activeJobIds])),
    pendingQuestion: fromChat.pendingQuestion || toChat.pendingQuestion,
    activeAgent: fromChat.activeAgent || toChat.activeAgent,
  }));

  const nextChats = { ...nextState.chats };
  delete nextChats[fromKey];
  nextState = { ...nextState, chats: nextChats };

  const pending = nextState.pendingAssistantMessageIdsByChat[fromKey];
  if (pending?.length) {
    const nextPending = { ...nextState.pendingAssistantMessageIdsByChat };
    nextPending[toKey] = [...(nextPending[toKey] || []), ...pending];
    delete nextPending[fromKey];
    nextState = { ...nextState, pendingAssistantMessageIdsByChat: nextPending };
  }

  const nextJobChatKeys = { ...nextState.jobChatKeys };
  for (const [jobId, chatKey] of Object.entries(nextJobChatKeys)) {
    if (chatKey === fromKey) {
      nextJobChatKeys[jobId] = toKey;
    }
  }

  return {
    ...nextState,
    jobChatKeys: nextJobChatKeys,
  };
}

function bindJobMessageInternal(
  state: AgentSessionState,
  jobId: string,
  chatId: string,
  explicitMessageId?: string,
): { state: AgentSessionState; chatKey: string; messageId: string } {
  const chatKey = getChatStateKey(chatId);
  const existingMessageId = explicitMessageId || state.jobMessageIds[jobId];
  if (existingMessageId) {
    return {
      state: {
        ...state,
        jobMessageIds: { ...state.jobMessageIds, [jobId]: existingMessageId },
        jobChatKeys: { ...state.jobChatKeys, [jobId]: chatKey },
      },
      chatKey,
      messageId: existingMessageId,
    };
  }

  const pending = state.pendingAssistantMessageIdsByChat[chatKey] || [];
  const pendingMessageId = pending[0];
  if (pendingMessageId) {
    const nextPendingByChat = { ...state.pendingAssistantMessageIdsByChat };
    if (pending.length === 1) {
      delete nextPendingByChat[chatKey];
    } else {
      nextPendingByChat[chatKey] = pending.slice(1);
    }

    return {
      state: {
        ...state,
        jobMessageIds: { ...state.jobMessageIds, [jobId]: pendingMessageId },
        jobChatKeys: { ...state.jobChatKeys, [jobId]: chatKey },
        pendingAssistantMessageIdsByChat: nextPendingByChat,
      },
      chatKey,
      messageId: pendingMessageId,
    };
  }

  const fallbackMessageId = `job-${jobId}`;
  let nextState = updateChat(state, chatKey, (chat) => {
    if (chat.messagesById[fallbackMessageId]) {
      return chat;
    }

    return upsertMessages(chat, [
      {
        id: fallbackMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        thinkingSteps: [],
      },
    ]);
  });

  nextState = {
    ...nextState,
    jobMessageIds: { ...nextState.jobMessageIds, [jobId]: fallbackMessageId },
    jobChatKeys: { ...nextState.jobChatKeys, [jobId]: chatKey },
  };

  return { state: nextState, chatKey, messageId: fallbackMessageId };
}

export function reconcileJobMessage(state: AgentSessionState, chatKey: string, jobId: string, targetMessageId: string): AgentSessionState {
  const fallbackMessageId = `job-${jobId}`;
  if (fallbackMessageId === targetMessageId) {
    return state;
  }

  const chat = getChat(state, chatKey);
  const fallbackMessage = chat.messagesById[fallbackMessageId];
  const targetMessage = chat.messagesById[targetMessageId];
  if (!fallbackMessage || !targetMessage) {
    return state;
  }

  let nextState = updateChat(state, chatKey, (currentChat) => {
    const mergedTarget: Message = {
      ...targetMessage,
      content: fallbackMessage.content || targetMessage.content,
      thinkingSteps:
        fallbackMessage.thinkingSteps && fallbackMessage.thinkingSteps.length > 0
          ? fallbackMessage.thinkingSteps
          : targetMessage.thinkingSteps,
      previewUrl: fallbackMessage.previewUrl || targetMessage.previewUrl,
      fileContent: fallbackMessage.fileContent || targetMessage.fileContent,
    };

    return removeMessage(updateMessage(currentChat, targetMessageId, () => mergedTarget), fallbackMessageId);
  });

  nextState = {
    ...nextState,
    jobMessageIds: {
      ...nextState.jobMessageIds,
      [jobId]: targetMessageId,
    },
  };

  return nextState;
}

export function bindJobToMessage(
  state: AgentSessionState,
  jobId: string,
  chatId: string,
  messageId: string,
): AgentSessionState {
  const chatKey = getChatStateKey(chatId);
  let nextState = {
    ...state,
    jobMessageIds: { ...state.jobMessageIds, [jobId]: messageId },
    jobChatKeys: { ...state.jobChatKeys, [jobId]: chatKey },
  };
  nextState = resolvePendingAssistantMessage(nextState, chatKey, messageId);
  return reconcileJobMessage(nextState, chatKey, jobId, messageId);
}

export function setJobActive(state: AgentSessionState, jobId: string, chatId: string, active: boolean): AgentSessionState {
  const chatKey = getChatStateKey(chatId);
  return updateChat(state, chatKey, (chat) => ({
    ...chat,
    activeJobIds: active
      ? Array.from(new Set([...chat.activeJobIds, jobId]))
      : chat.activeJobIds.filter((existingJobId) => existingJobId !== jobId),
    activeAgent: active ? chat.activeAgent : chat.activeJobIds.length <= 1 ? null : chat.activeAgent,
  }));
}

export function applyJobSnapshot(state: AgentSessionState, job: JobSnapshot): AgentSessionState {
  const ensured = bindJobMessageInternal(state, job.id, job.chatId);
  let nextState = updateChat(ensured.state, ensured.chatKey, (chat) => {
    const existing = chat.messagesById[ensured.messageId];
    const nextMessage: Message = existing
      ? {
          ...existing,
          content: job.finalContent || existing.content,
          previewUrl: job.previewUrl || existing.previewUrl,
          fileContent: job.fileContent || existing.fileContent,
          thinkingSteps: job.steps || existing.thinkingSteps,
        }
      : {
          id: ensured.messageId,
          role: "assistant",
          content: job.finalContent,
          timestamp: new Date(job.createdAt),
          previewUrl: job.previewUrl || undefined,
          fileContent: job.fileContent,
          thinkingSteps: job.steps || [],
        };

    return {
      ...upsertMessages(chat, [nextMessage]),
      sandboxId: job.sandboxId || chat.sandboxId,
      activeJobIds:
        job.status === "running"
          ? Array.from(new Set([...chat.activeJobIds, job.id]))
          : chat.activeJobIds.filter((existingJobId) => existingJobId !== job.id),
    };
  });

  if (job.status !== "running") {
    nextState = updateChat(nextState, ensured.chatKey, (chat) => ({ ...chat, activeAgent: null }));
  }

  return nextState;
}

export function applySessionSnapshot(state: AgentSessionState, snapshot: SessionSnapshotEvent): AgentSessionState {
  if (
    (typeof snapshot.snapshotSequence === "number" && snapshot.snapshotSequence <= state.lastSnapshotSequence) ||
    (snapshot.snapshotEventId && state.lastSnapshotEventId && compareStreamIds(snapshot.snapshotEventId, state.lastSnapshotEventId) <= 0)
  ) {
    return state;
  }

  const activeJobIds = new Set(snapshot.jobs.map((job) => job.id));
  let nextState: AgentSessionState = {
    ...state,
    chats: Object.fromEntries(
      Object.entries(state.chats).map(([chatKey, chat]) => [
        chatKey,
        {
          ...chat,
          activeJobIds: chat.activeJobIds.filter((jobId) => activeJobIds.has(jobId)),
          activeAgent: chat.activeJobIds.some((jobId) => activeJobIds.has(jobId)) ? chat.activeAgent : null,
        },
      ]),
    ),
  };

  for (const job of snapshot.jobs) {
    nextState = applyJobSnapshot(nextState, job);
  }

  return withSnapshotEventMeta(nextState, snapshot);
}

export function applyLoadedChat(
  state: AgentSessionState,
  chatId: string,
  messages: Message[],
  sandboxId: string | null,
): AgentSessionState {
  const chatKey = getChatStateKey(chatId);
  return updateChat(state, chatKey, (chat) => ({
    ...createEmptyChatState(),
    ...chat,
    sandboxId: sandboxId || chat.sandboxId,
    messagesById: Object.fromEntries(messages.map((message) => [message.id, message])),
    messageOrder: messages.map((message) => message.id),
  }));
}

export function resetDraftChat(state: AgentSessionState): AgentSessionState {
  return {
    ...state,
    chats: {
      ...state.chats,
      [DRAFT_CHAT_KEY]: createEmptyChatState(),
    },
    pendingAssistantMessageIdsByChat: {
      ...state.pendingAssistantMessageIdsByChat,
      [DRAFT_CHAT_KEY]: [],
    },
  };
}

export function updateJobBoundMessage(
  state: AgentSessionState,
  jobId: string,
  chatId: string,
  updater: (message: Message) => Message,
): AgentSessionState {
  const ensured = bindJobMessageInternal(state, jobId, chatId);
  const fallbackMessageId = `job-${jobId}`;

  return updateChat(ensured.state, ensured.chatKey, (chat) => {
    const candidateIds = new Set<string>([ensured.messageId, fallbackMessageId]);
    const hasCandidate = chat.messageOrder.some((messageId) => candidateIds.has(messageId));
    if (!hasCandidate) {
      const pendingMessageId = ensured.state.pendingAssistantMessageIdsByChat[ensured.chatKey]?.at(-1);
      if (pendingMessageId) {
        candidateIds.add(pendingMessageId);
      }
    }

    let nextChat = chat;
    for (const candidateId of candidateIds) {
      nextChat = updateMessage(nextChat, candidateId, updater);
    }
    return nextChat;
  });
}

export function applyStreamEvent(state: AgentSessionState, event: StreamEvent): AgentSessionState {
  if (event.type === "session_connected") {
    return state;
  }

  if (isStaleEvent(state, event)) {
    return state;
  }

  if (event.type === "session_snapshot") {
    return applySessionSnapshot(state, event as unknown as SessionSnapshotEvent);
  }

  if (event.type === "job_snapshot") {
    return withAppliedEventMeta(applyJobSnapshot(state, event as unknown as JobSnapshot), event);
  }

  const jobId = typeof event.jobId === "string" ? event.jobId : null;
  const chatId = typeof event.chatId === "string" ? event.chatId : null;
  if (!jobId || !chatId) {
    return state;
  }

  const chatKey = getChatStateKey(chatId);

  if (event.type === "job_created") {
    return withAppliedEventMeta(setJobActive(state, jobId, chatId, true), event);
  }

  if (event.type === "agent_mode") {
    return withAppliedEventMeta(setChatMeta(state, chatKey, {
      activeAgent: { mode: event.mode as "plan" | "build", name: event.name as string },
    }), event);
  }

  if (event.type === "sandbox_info") {
    return withAppliedEventMeta(setChatMeta(state, chatKey, { sandboxId: typeof event.sandboxId === "string" ? event.sandboxId : null }), event);
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

    return withAppliedEventMeta(updateJobBoundMessage(state, jobId, chatId, (message) => ({
      ...message,
      thinkingSteps: [
        ...(message.thinkingSteps || []),
        ...(message.thinkingSteps || []).some((step) => step.id === stepId) ? [] : [nextStep],
      ],
    })), event);
  }

  if (event.type === "step_update") {
    const stepId = String(event.id);
    return withAppliedEventMeta(updateJobBoundMessage(state, jobId, chatId, (message) => ({
      ...message,
      thinkingSteps: (message.thinkingSteps || []).map((step) =>
        step.id === stepId ? { ...step, content: event.content as string } : step,
      ),
    })), event);
  }

  if (event.type === "step_complete") {
    const stepId = String(event.id);
    return withAppliedEventMeta(updateJobBoundMessage(state, jobId, chatId, (message) => ({
      ...message,
      thinkingSteps: (message.thinkingSteps || []).map((step) =>
        step.id === stepId
          ? {
              ...step,
              status: "complete",
              result: (event.result ?? step.result) as string | undefined,
              filename: step.filename || (event.filename as string | undefined),
              fileContent: step.fileContent || (event.fileContent as string | undefined),
            }
          : step,
      ),
    })), event);
  }

  if (event.type === "text_delta") {
    return withAppliedEventMeta(updateJobBoundMessage(state, jobId, chatId, (message) => ({
      ...message,
      content: `${message.content}${String(event.content || "")}`,
    })), event);
  }

  if (event.type === "slide_content") {
    return withAppliedEventMeta(updateJobBoundMessage(state, jobId, chatId, (message) => ({
      ...message,
      fileContent: event.fileContent as string | undefined,
    })), event);
  }

  if (event.type === "file_written") {
    const filename = typeof event.filename === "string" ? event.filename : undefined;
    const fileContent = typeof event.content === "string" ? event.content : undefined;
    if (filename === "index.html" && fileContent?.includes('<script id="slide-data"')) {
      return withAppliedEventMeta(updateJobBoundMessage(state, jobId, chatId, (message) => ({ ...message, fileContent })), event);
    }
    return state;
  }

  if (event.type === "ask_user") {
    return withAppliedEventMeta(updateJobBoundMessage(
      setChatMeta(state, chatKey, {
        pendingQuestion: {
          question: event.question as string,
          options: event.options as PendingQuestion["options"],
          context: event.context as string,
          threadId: event.threadId as string,
        },
      }),
      jobId,
      chatId,
      (message) => ({ ...message, content: "I have a question for you..." }),
    ), event);
  }

  if (event.type === "delegate_build") {
    return withAppliedEventMeta(updateJobBoundMessage(state, jobId, chatId, (message) => ({
      ...message,
      content: "Plan approved! The Build agent will now execute...",
    })), event);
  }

  if (event.type === "done") {
    return withAppliedEventMeta(setChatMeta(
      updateJobBoundMessage(setJobActive(state, jobId, chatId, false), jobId, chatId, (message) => ({
        ...message,
        content: (event.content ?? message.content) as string,
        previewUrl: event.previewUrl as string | undefined,
      })),
      chatKey,
      { activeAgent: null },
    ), event);
  }

  if (event.type === "error") {
    return withAppliedEventMeta(setChatMeta(setJobActive(state, jobId, chatId, false), chatKey, { activeAgent: null }), event);
  }

  return state;
}
