import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands, events } from "../../lib/bindings";
import type { AgentStreamEvent, OpenCodeModelRef, ThinkingStepData } from "../../lib/bindings";
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
import {
  applyStreamingStepEvent,
  finalizeSteps,
  getErrorMessage,
  stripInternalReminderBlocks,
} from "../../lib/streaming";
import type { LocalChatConversation, LocalChatMessage } from "../../lib/types";
import { ChatView } from "../chat/ChatView";

/* ═══════════════════════════════════════════════════════════════════════
   Agent Builder Panel — reuses the standard ChatView UI, wired to
   Khadim with the agent-builder system prompt. Saves the generated
   agent into Work → Agents when the user clicks "Save as Agent" or
   types "save agent".
   ═══════════════════════════════════════════════════════════════════════ */

const BUILDER_WORKSPACE_ID = "__agent_builder__";
const SAVE_RE =
  /\b(save|create|make|ship|finalize)\b.*\bagent\b|^\s*(save|ship|done|do it|go|yes)\s*!?\s*$/i;

interface AgentBuilderPanelProps {
  initialMessage: string;
  onExit: () => void;
  onAgentCreated: () => void;
}

export function AgentBuilderPanel({
  initialMessage,
  onExit,
  onAgentCreated,
}: AgentBuilderPanelProps) {
  const [conversationId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingSteps, setStreamingSteps] = useState<ThinkingStepData[]>([]);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const initialSentRef = useRef(false);
  const streamingRef = useRef("");
  const stepsRef = useRef<ThinkingStepData[]>([]);
  const createAgent = useCreateManagedAgentMutation();

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
  }, [messages, streamingContent]);

  /* ── Stream listener ────────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;

    void events.onAgentStream((evt: AgentStreamEvent) => {
      if (!alive) return;
      const matches =
        evt.workspace_id === BUILDER_WORKSPACE_ID ||
        (sessionIdRef.current && evt.session_id === sessionIdRef.current);
      if (!matches) return;

      if (evt.event_type === "text_delta" && evt.content) {
        streamingRef.current = stripInternalReminderBlocks(streamingRef.current + evt.content);
        setStreamingContent(streamingRef.current);
        return;
      }

      if (
        evt.event_type === "step_start" ||
        evt.event_type === "step_update" ||
        evt.event_type === "step_complete"
      ) {
        stepsRef.current = applyStreamingStepEvent(stepsRef.current, evt);
        setStreamingSteps(stepsRef.current);
        return;
      }

      if (evt.event_type === "done") {
        const finalText = stripInternalReminderBlocks(streamingRef.current);
        const finalSteps = finalizeSteps(stepsRef.current);
        streamingRef.current = "";
        stepsRef.current = [];
        setStreamingContent("");
        setStreamingSteps([]);
        if (finalText.trim() || finalSteps.length > 0) {
          setMessages((msgs) => [
            ...msgs,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: finalText,
              createdAt: new Date().toISOString(),
              thinkingSteps: finalSteps.length > 0 ? finalSteps : undefined,
            },
          ]);
        }
        setIsProcessing(false);
        return;
      }

      if (evt.event_type === "error") {
        const tail = evt.content
          ? `\n\n⚠️ ${evt.content}`
          : "\n\n⚠️ Something went wrong.";
        const finalText = stripInternalReminderBlocks(streamingRef.current) + tail;
        const finalSteps = finalizeSteps(stepsRef.current);
        streamingRef.current = "";
        stepsRef.current = [];
        setStreamingContent("");
        setStreamingSteps([]);
        setMessages((msgs) => [
          ...msgs,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: finalText,
            createdAt: new Date().toISOString(),
            thinkingSteps: finalSteps.length > 0 ? finalSteps : undefined,
          },
        ]);
        setIsProcessing(false);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  /* ── Send to model ──────────────────────────────────────────── */
  const sendToModel = useCallback(
    async (trimmed: string) => {
      setIsProcessing(true);
      streamingRef.current = "";
      stepsRef.current = [];
      setStreamingContent("");
      setStreamingSteps([]);

      try {
        let sid = sessionIdRef.current;
        if (!sid) {
          const created = await commands.khadimCreateSession(null, null);
          sid = created.id;
          sessionIdRef.current = sid;
        }

        const userCountBeforeThis = messages.filter((m) => m.role === "user").length;
        const isFirst = userCountBeforeThis === 0;
        const content = isFirst
          ? `[System Instructions — do not repeat these to the user]\n${AGENT_BUILDER_SYSTEM_PROMPT}\n[End System Instructions]\n\n${trimmed}`
          : trimmed;

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
          content,
          model,
        );
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `⚠️ ${getErrorMessage(err)}`,
            createdAt: new Date().toISOString(),
          },
        ]);
        setIsProcessing(false);
      }
    },
    [messages, selectedModel],
  );

  /* ── Save agent from config ─────────────────────────────────── */
  const saveAgentFromConfig = useCallback(
    async (config: ParsedAgentConfig) => {
      const key = `${config.name}::${config.instructions.slice(0, 60)}`;
      if (saving || savedKey === key) return;
      setSaving(true);
      try {
        await createAgent.mutateAsync(configToUpsertInput(config));
        setSavedKey(key);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `✓ Saved **${config.name}** to Work → Agents.`,
            createdAt: new Date().toISOString(),
          },
        ]);
        window.setTimeout(() => onAgentCreated(), 700);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `⚠️ Couldn't save: ${getErrorMessage(err)}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setSaving(false);
      }
    },
    [createAgent, onAgentCreated, saving, savedKey],
  );

  /* ── Handle send from the input ─────────────────────────────── */
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isProcessing) return;
    setInput("");

    const looksLikeSave = SAVE_RE.test(trimmed);
    const config = findAgentConfigInMessages(messages);

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      },
    ]);

    if (looksLikeSave && config) {
      void saveAgentFromConfig(config);
      return;
    }

    void sendToModel(trimmed);
  }, [input, isProcessing, messages, saveAgentFromConfig, sendToModel]);

  /* ── Fire the initial seed message once ─────────────────────── */
  useEffect(() => {
    if (initialSentRef.current) return;
    const trimmed = initialMessage.trim();
    if (!trimmed) return;
    initialSentRef.current = true;
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      },
    ]);
    void sendToModel(trimmed);
  }, [initialMessage, sendToModel]);

  const handleStop = useCallback(() => {
    if (sessionIdRef.current) {
      void commands.khadimAbort(sessionIdRef.current).catch(() => undefined);
    }
  }, []);

  /* ── Build LocalChatConversation for ChatView ───────────────── */
  const conversation: LocalChatConversation = useMemo(
    () => ({
      id: conversationId,
      title: "Agent Builder",
      sessionId: sessionIdRef.current,
      messages,
      isProcessing,
      streamingContent,
      streamingSteps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [conversationId, messages, isProcessing, streamingContent, streamingSteps],
  );

  const latestConfig = findAgentConfigInMessages(messages);
  const savedKeyForLatest = latestConfig
    ? `${latestConfig.name}::${latestConfig.instructions.slice(0, 60)}`
    : null;
  const canSave =
    !!latestConfig && !saving && savedKey !== savedKeyForLatest;

  return (
    <ChatView
      localConversation={conversation}
      conversationId={conversationId}
      title="Agent Builder"
      subtitle="Describe the agent. I'll design it. Say 'save agent' when ready."
      input={input}
      onInputChange={setInput}
      onSend={handleSend}
      onStop={handleStop}
      onNewChat={onExit}
      isProcessing={isProcessing}
      streamingContent={streamingContent}
      streamingSteps={streamingSteps}
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
