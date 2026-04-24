import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands } from "../../lib/bindings";
import type { OpenCodeModelRef } from "../../lib/bindings";
import {
  AGENT_BUILDER_SYSTEM_PROMPT,
  configToUpsertInput,
  findAgentConfigInMessages,
  type ParsedAgentConfig,
} from "../../lib/agent-builder-chat";
import {
  useCreateManagedAgentMutation,
  useSettingQuery,
  useSetSettingMutation,
  useWorkspaceModelsQuery,
} from "../../lib/queries";
import {
  getModelSettingKey,
  parseStoredModel,
  resolvePreferredModel,
  selectModelByKey,
} from "../../lib/model-selection";
import { getErrorMessage } from "../../lib/streaming";
import type { BuilderChat, LocalChatConversation, LocalChatMessage } from "../../lib/types";
import type { BuilderStreamState } from "../../hooks/useBuilderChats";
import { ChatView } from "../chat/ChatView";

/* ═══════════════════════════════════════════════════════════════════════
   Agent Builder Panel — reuses the standard ChatView UI, wired to
   Khadim with the agent-builder system prompt. Streaming state is owned
   by useBuilderChats so drafts survive navigation away from the panel
   mid-response.
   ═══════════════════════════════════════════════════════════════════════ */

const BUILDER_WORKSPACE_ID = "__agent_builder__";
const SAVE_RE =
  /\b(save|create|make|ship|finalize)\b.*\bagent\b|^\s*(save|ship|done|do it|go|yes)\s*!?\s*$/i;

interface AgentBuilderPanelProps {
  chat: BuilderChat;
  stream: BuilderStreamState;
  onUpdate: (partial: Partial<BuilderChat>) => void;
  onMarkSending: (sessionId: string) => void;
  onExit: () => void;
  onNewDraft?: () => void;
  onAbort: () => void | Promise<void>;
  onAgentCreated: (agentId: string, agentName: string) => void;
  /** Set when this draft was restored with a dropped in-flight session. */
  stale?: boolean;
  onDismissStale?: () => void;
}

export function AgentBuilderPanel({
  chat,
  stream,
  onUpdate,
  onMarkSending,
  onExit,
  onNewDraft,
  onAbort,
  onAgentCreated,
  stale = false,
  onDismissStale,
}: AgentBuilderPanelProps) {
  const chatId = chat.id;
  const [input, setInput] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(
    chat.savedAgentId && chat.savedAgentName
      ? `${chat.savedAgentName}::saved`
      : null,
  );
  const [saving, setSaving] = useState(false);
  const sessionIdRef = useRef<string | null>(chat.sessionId);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const initialSentRef = useRef(chat.messages.length > 0);
  const messagesRef = useRef<LocalChatMessage[]>(chat.messages);
  const onUpdateRef = useRef(onUpdate);
  const onMarkSendingRef = useRef(onMarkSending);
  const createAgent = useCreateManagedAgentMutation();

  // Keep refs in sync
  useEffect(() => {
    messagesRef.current = chat.messages;
    sessionIdRef.current = chat.sessionId;
  }, [chat.messages, chat.sessionId]);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  useEffect(() => {
    onMarkSendingRef.current = onMarkSending;
  }, [onMarkSending]);

  // Reset local UI state if the active chat changes under us
  useEffect(() => {
    initialSentRef.current = chat.messages.length > 0;
    setSavedKey(
      chat.savedAgentId && chat.savedAgentName ? `${chat.savedAgentName}::saved` : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  /* ── Model selection (same pattern as standalone chat) ──────── */
  const { data: availableModels = [] } = useWorkspaceModelsQuery(
    BUILDER_WORKSPACE_ID,
    "khadim",
    false,
  );
  const modelSettingKey = useMemo(
    () => getModelSettingKey(BUILDER_WORKSPACE_ID),
    [],
  );
  const { data: storedModel = null } = useSettingQuery(modelSettingKey);
  const setSetting = useSetSettingMutation();
  const [modelOverride, setModelOverride] = useState<OpenCodeModelRef | null>(null);
  const selectedModel = useMemo(
    () =>
      resolvePreferredModel(
        availableModels,
        modelOverride ?? parseStoredModel(storedModel),
      ),
    [availableModels, modelOverride, storedModel],
  );

  const handleSelectModel = useCallback(
    (key: string) => {
      const next = selectModelByKey(availableModels, key);
      if (!next) return;
      setModelOverride(next);
      void setSetting
        .mutateAsync({ key: modelSettingKey, value: JSON.stringify(next) })
        .catch(() => undefined);
    },
    [availableModels, modelSettingKey, setSetting],
  );

  /* ── Auto-scroll ────────────────────────────────────────────── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.messages, stream.streamingContent]);

  /* ── Send to model ──────────────────────────────────────────── */
  const sendToModel = useCallback(
    async (trimmed: string) => {
      try {
        let sid = sessionIdRef.current;
        if (!sid) {
          // Pass AGENT_BUILDER_SYSTEM_PROMPT as a true system prompt
          // override so the orchestrator uses it in place of the default
          // coding-mode prompt. The model then behaves as an agent builder.
          const created = await commands.khadimCreateSession(
            BUILDER_WORKSPACE_ID,
            null,
            AGENT_BUILDER_SYSTEM_PROMPT,
          );
          sid = created.id;
          sessionIdRef.current = sid;
          onUpdateRef.current({ sessionId: sid });
        }

        // Mark the draft as actively sending so the controller records
        // the sessionId and flips isProcessing immediately (before any
        // stream events arrive) and keeps doing so even if this panel
        // unmounts.
        onMarkSendingRef.current(sid);

        const model: OpenCodeModelRef | null = selectedModel
          ? {
              provider_id: selectedModel.provider_id,
              model_id: selectedModel.model_id,
            }
          : null;

        await commands.khadimSendStreaming(
          BUILDER_WORKSPACE_ID,
          sid,
          null,
          null,
          trimmed,
          model,
        );
      } catch (err) {
        onUpdateRef.current({ sessionId: null });
        onMarkSendingRef.current("");
        const assistantMessage: LocalChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ ${getErrorMessage(err)}`,
          createdAt: new Date().toISOString(),
        };
        onUpdateRef.current({
          messages: [...messagesRef.current, assistantMessage],
        });
      }
    },
    [selectedModel],
  );

  /* ── Save agent from config ─────────────────────────────────── */
  const saveAgentFromConfig = useCallback(
    async (config: ParsedAgentConfig) => {
      const key = `${config.name}::${config.instructions.slice(0, 60)}`;
      if (saving || savedKey === key) return;
      setSaving(true);
      try {
        const created = await createAgent.mutateAsync(configToUpsertInput(config));
        setSavedKey(key);
        const confirmation: LocalChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `✓ Saved **${config.name}** to Work → Agents.`,
          createdAt: new Date().toISOString(),
        };
        const next = [...messagesRef.current, confirmation];
        onUpdateRef.current({
          messages: next,
          sessionId: sessionIdRef.current,
          savedAgentId: created.id,
          savedAgentName: config.name,
          title: config.name,
        });
        window.setTimeout(() => onAgentCreated(created.id, config.name), 700);
      } catch (err) {
        const errorMessage: LocalChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ Couldn't save: ${getErrorMessage(err)}`,
          createdAt: new Date().toISOString(),
        };
        onUpdateRef.current({
          messages: [...messagesRef.current, errorMessage],
        });
      } finally {
        setSaving(false);
      }
    },
    [createAgent, onAgentCreated, saving, savedKey],
  );

  /* ── Handle send from the input ─────────────────────────────── */
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || stream.isProcessing) return;
    setInput("");
    // User engaged — any "paused" notice is no longer relevant.
    onDismissStale?.();

    const looksLikeSave = SAVE_RE.test(trimmed);
    const config = findAgentConfigInMessages(messagesRef.current);

    const userMessage: LocalChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const firstUser = [userMessage, ...messagesRef.current].find((m) => m.role === "user");
    const derivedTitle = firstUser ? firstUser.content.slice(0, 60) : chat.title;
    onUpdateRef.current({
      messages: [...messagesRef.current, userMessage],
      title: derivedTitle || "New draft",
    });

    if (looksLikeSave && config) {
      void saveAgentFromConfig(config);
      return;
    }

    void sendToModel(trimmed);
  }, [
    chat.title,
    input,
    onDismissStale,
    saveAgentFromConfig,
    sendToModel,
    stream.isProcessing,
  ]);

  /* ── Fire the initial seed message once ─────────────────────── */
  useEffect(() => {
    if (initialSentRef.current) return;
    const trimmed = chat.seedMessage?.trim() ?? "";
    if (!trimmed) return;
    initialSentRef.current = true;
    const seedMessage: LocalChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    onUpdateRef.current({ messages: [seedMessage] });
    void sendToModel(trimmed);
  }, [chat.seedMessage, sendToModel]);

  const handleStop = useCallback(() => {
    void Promise.resolve(onAbort()).catch(() => undefined);
  }, [onAbort]);

  /* ── Build LocalChatConversation for ChatView ───────────────── */
  const conversation: LocalChatConversation = useMemo(
    () => ({
      id: chat.id,
      title: chat.title,
      sessionId: chat.sessionId,
      messages: chat.messages,
      isProcessing: stream.isProcessing,
      streamingContent: stream.streamingContent,
      streamingSteps: stream.streamingSteps,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    }),
    [
      chat.id,
      chat.title,
      chat.sessionId,
      chat.messages,
      chat.createdAt,
      chat.updatedAt,
      stream.isProcessing,
      stream.streamingContent,
      stream.streamingSteps,
    ],
  );

  const latestConfig = findAgentConfigInMessages(chat.messages);
  const savedKeyForLatest = latestConfig
    ? `${latestConfig.name}::${latestConfig.instructions.slice(0, 60)}`
    : null;
  const canSave =
    !!latestConfig && !saving && savedKey !== savedKeyForLatest;

  return (
    <ChatView
      localConversation={conversation}
      conversationId={chat.id}
      title={chat.savedAgentName ? `${chat.savedAgentName} · saved` : "Agent Builder"}
      subtitle={
        stale && !chat.savedAgentId
          ? "Previous session ended when the app closed. Send a message to pick up where you left off."
          : chat.savedAgentId
            ? "Saved. Keep iterating or open the agent in Work → Agents."
            : "Describe the agent. I'll design it. Say 'save agent' when ready."
      }
      input={input}
      onInputChange={setInput}
      onSend={handleSend}
      onStop={handleStop}
      onNewChat={onNewDraft ?? onExit}
      onBack={onExit}
      backLabel="Drafts"
      isProcessing={stream.isProcessing}
      streamingContent={stream.streamingContent}
      streamingSteps={stream.streamingSteps}
      onSaveAsAgent={
        canSave && latestConfig
          ? () => void saveAgentFromConfig(latestConfig)
          : undefined
      }
      availableModels={availableModels}
      selectedModel={selectedModel}
      onSelectModel={handleSelectModel}
      chatEndRef={chatEndRef}
      backend="khadim"
    />
  );
}
