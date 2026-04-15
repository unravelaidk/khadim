import { useMemo, memo, type RefObject } from "react";
import type {
  ChatMessage as StoredMessage,
  OpenCodeModelOption,
  OpenCodeModelRef,
  ThinkingStepData,
} from "../../lib/bindings";
import type { AgentInstance, LocalChatConversation } from "../../lib/types";
import { getModelKey, findSelectedModelOption } from "../../lib/model-selection";
import { ChatMessage, TypingIndicator } from "../ChatMessage";
import { ChatInput, type ChatAttachment } from "../ChatInput";
import { ContextBar } from "../ContextBar";
import { WelcomeScreen } from "../WelcomeScreen";
import { StatusIndicator } from "../StatusIndicator";

type TempPreset = "precise" | "balanced" | "creative";

/** Normalise local chat messages into the StoredMessage shape used by ChatMessage. */
function localToStored(conv: LocalChatConversation): Array<StoredMessage & { thinkingSteps?: ThinkingStepData[] }> {
  return conv.messages.map((m) => ({
    id: m.id,
    conversation_id: conv.id,
    role: m.role,
    content: m.content,
    metadata: null,
    created_at: m.createdAt,
    thinkingSteps: m.thinkingSteps,
  }));
}

const FLEX_FILL_STYLE = { flex: "1 1 0%", minHeight: 0 } as const;

// ────────────────────────────────────────────────────────────────────

interface ChatViewProps {
  // ── Messages ──────────────────────────────────────────────────
  /** Supply EITHER `messages` (agent/workspace chat) OR `localConversation` (standalone chat). */
  messages?: Array<StoredMessage & { thinkingSteps?: ThinkingStepData[] }>;
  localConversation?: LocalChatConversation | null;

  // ── Identity / header ─────────────────────────────────────────
  conversationId: string | null;
  title?: string | null;
  subtitle?: string | null;

  // ── Input / actions ───────────────────────────────────────────
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onNewChat: () => void;
  isProcessing: boolean;
  streamingContent: string;
  streamingSteps: ThinkingStepData[];

  // ── Post-completion ───────────────────────────────────────────
  /** Called when user wants to promote this chat into a managed agent */
  onSaveAsAgent?: () => void;

  // ── Model selector ────────────────────────────────────────────
  availableModels: OpenCodeModelOption[];
  selectedModel: OpenCodeModelRef | null;
  onSelectModel: (key: string) => void;

  // ── Scroll ref ────────────────────────────────────────────────
  chatEndRef: RefObject<HTMLDivElement | null>;

  // ── Optional: base path for file links in tool steps ──────────
  basePath?: string | null;

  // ── Optional: agent context (shows ContextBar + status dot) ───
  agent?: AgentInstance | null;

  // ── Optional: open file callback (for tool step links) ──────
  onOpenFile?: (path: string) => void;

  // ── Backend type for logo/name display ────────────────────────
  backend?: string;

  // ── Chat tools ────────────────────────────────────────────────
  systemPrompt?: string;
  onSystemPromptChange?: (v: string) => void;
  temperature?: TempPreset;
  onTemperatureChange?: (preset: TempPreset) => void;
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (files: ChatAttachment[]) => void;
}

export const ChatView = memo(function ChatView({
  messages: externalMessages,
  localConversation,
  conversationId,
  title,
  subtitle,
  input,
  onInputChange,
  onSend,
  onStop,
  onNewChat,
  isProcessing,
  streamingContent,
  streamingSteps,
  onSaveAsAgent,
  availableModels,
  selectedModel,
  onSelectModel,
  chatEndRef,
  basePath,
  agent,
  onOpenFile,
  backend = "khadim",
  systemPrompt,
  onSystemPromptChange,
  temperature,
  onTemperatureChange,
  attachments,
  onAttachmentsChange,
}: ChatViewProps) {
  // ── Normalise messages ────────────────────────────────────────
  const displayMessages = useMemo(() => {
    if (externalMessages) return externalMessages;
    if (localConversation) return localToStored(localConversation);
    return [];
  }, [externalMessages, localConversation]);

  // ── Model label for header badge ──────────────────────────────
  const modelOption = findSelectedModelOption(availableModels, selectedModel);
  const modelLabel = modelOption
    ? `${modelOption.provider_name} / ${modelOption.model_name}`
    : selectedModel
      ? `${selectedModel.provider_id} / ${selectedModel.model_id}`
      : null;

  const hasContent = displayMessages.length > 0 || isProcessing;
  const effectiveBasePath = basePath ?? undefined;

  // ── Header status dot ─────────────────────────────────────────
  const statusDot = agent ? (
    <StatusIndicator
      status={agent.status}
      size="sm"
    />
  ) : isProcessing ? (
    <StatusIndicator status="running" size="sm" />
  ) : null;

  // ── Derive header text ────────────────────────────────────────
  const headerTitle = title ?? "Chat";
  const headerSubtitle =
    subtitle ??
    (agent?.currentActivity ??
      (displayMessages.length > 0
        ? `${displayMessages.length} messages`
        : "Start a new conversation"));

  return (
    <div className="relative flex flex-col overflow-hidden" style={FLEX_FILL_STYLE}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-4 border-b border-[var(--glass-border)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {statusDot}
          {!agent && (
            <i className="ri-chat-1-line text-[20px] leading-none text-[var(--text-muted)]" />
          )}
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{headerTitle}</h2>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5 truncate">{headerSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {modelLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full depth-card-sm px-3 py-1 text-[12px] font-medium text-[var(--text-secondary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
              {modelLabel}
            </span>
          )}
          <button
            onClick={onNewChat}
            className="h-9 px-4 rounded-xl text-[13px] font-semibold text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] transition-colors"
          >
            New
          </button>
        </div>
      </div>

      {/* ── Optional context bar (agent mode) ───────────────────── */}
      {agent && <ContextBar agent={agent} isStreaming={isProcessing} />}

      {/* ── Message area ────────────────────────────────────────── */}
      <main
        className={`min-h-0 flex-1 overflow-y-auto scrollbar-thin ${
          !hasContent ? "px-0 py-6" : "pb-4 pt-3 md:pt-6"
        }`}
      >
        {!hasContent ? (
          <WelcomeScreen input={input} setInput={onInputChange} onSend={onSend} compact hideInput />
        ) : (
          <div className="mx-auto flex gap-4 px-4 md:px-6 max-w-3xl">
            <div className="min-w-0 flex-1">
              <div className="space-y-6">
                  {displayMessages.map((message) => (
                    <ChatMessage key={message.id} message={message} basePath={effectiveBasePath} backend={backend} />
                  ))}

                  {/* Streaming message */}
                  {isProcessing && (streamingContent || streamingSteps.length > 0) ? (
                    <ChatMessage
                      message={{
                        id: "__streaming__",
                        conversation_id: conversationId ?? "",
                        role: "assistant",
                        content: streamingContent,
                        metadata: null,
                        created_at: new Date().toISOString(),
                        thinkingSteps: streamingSteps,
                      }}
                      isStreaming
                      basePath={effectiveBasePath}
                      backend={backend}
                    />
                  ) : null}

                  {/* Typing indicator */}
                  {isProcessing && !streamingContent && streamingSteps.length === 0 ? (
                    <TypingIndicator backend={backend} />
                  ) : null}

                  {/* Save as Agent action — shown after completion */}
                  {onSaveAsAgent && !isProcessing && displayMessages.length >= 2 && displayMessages[displayMessages.length - 1]?.role === "assistant" && (
                    <div className="mt-4 mb-2 flex items-center gap-3">
                      <button
                        onClick={onSaveAsAgent}
                        className="inline-flex items-center gap-2 rounded-full bg-[var(--glass-bg)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                      >
                        <i className="ri-add-line text-[14px] leading-none" />
                        Save as Agent
                      </button>
                      <span className="text-[12px] text-[var(--text-muted)]">
                        Turn this into a reusable automation
                      </span>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Input area (flex sibling, always visible) ────────────── */}
      <div className="shrink-0">
        <ChatInput
          value={input}
          onChange={onInputChange}
          onSend={onSend}
          onStop={onStop}
          isProcessing={isProcessing}
          availableModels={availableModels}
          selectedModelKey={selectedModel ? getModelKey(selectedModel) : null}
          onSelectModel={onSelectModel}
          modelDisabled={isProcessing}
          systemPrompt={systemPrompt}
          onSystemPromptChange={onSystemPromptChange}
          temperature={temperature}
          onTemperatureChange={onTemperatureChange}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
        />
      </div>
    </div>
  );
});
