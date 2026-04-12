import { useMemo, type RefObject } from "react";
import type {
  ChatMessage as StoredMessage,
  OpenCodeModelOption,
  OpenCodeModelRef,
  ThinkingStepData,
} from "../../lib/bindings";
import type { AgentInstance, LocalChatConversation } from "../../lib/types";
import { ChatMessage, TypingIndicator } from "../ChatMessage";
import { ChatInput } from "../ChatInput";
import { ContextBar } from "../ContextBar";
import { ModifiedFilesPanel } from "../ModifiedFilesPanel";
import { WelcomeScreen } from "../WelcomeScreen";
import { StatusIndicator } from "../StatusIndicator";

function getModelKey(model: OpenCodeModelRef) {
  return `${model.provider_id}:${model.model_id}`;
}

function findSelectedModelOption(models: OpenCodeModelOption[], selected: OpenCodeModelRef | null) {
  if (!selected) return null;
  return models.find((m) => getModelKey(m) === getModelKey(selected)) ?? null;
}

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

  // ── Optional: modified files side-panel (workspace chat) ──────
  showModifiedFiles?: boolean;
  onOpenFile?: (path: string) => void;

  // ── Backend type for logo/name display ────────────────────────
  backend?: string;
}

export function ChatView({
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
  availableModels,
  selectedModel,
  onSelectModel,
  chatEndRef,
  basePath,
  agent,
  showModifiedFiles = false,
  onOpenFile,
  backend = "khadim",
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
  const showSidePanel = showModifiedFiles && basePath;
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
    <div className="relative flex flex-col overflow-hidden" style={{ flex: "1 1 0%", minHeight: 0 }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-3 border-b border-[var(--glass-border)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {statusDot}
          {!agent && (
            <svg
              className="w-4 h-4 shrink-0 text-[var(--text-muted)]"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
              />
            </svg>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{headerTitle}</h2>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{headerSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {modelLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full glass-panel px-2.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
              {modelLabel}
            </span>
          )}
          <button
            onClick={onNewChat}
            className="h-7 px-2.5 rounded-xl text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
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
          <div className={`mx-auto flex gap-4 px-4 md:px-6 ${showSidePanel ? "max-w-6xl" : "max-w-3xl"}`}>
            <div className={`min-w-0 flex-1 ${showSidePanel ? "max-w-3xl" : ""}`}>
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

                  <div ref={chatEndRef} />
                </div>
            </div>

            {/* ── Optional: modified files side panel ───────────── */}
            {showSidePanel && basePath && (
              <div className="hidden xl:block w-[260px] shrink-0 sticky top-0 self-start">
                <ModifiedFilesPanel
                  repoPath={basePath}
                  isStreaming={isProcessing}
                  onOpenFile={onOpenFile}
                />
              </div>
            )}
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
        />
      </div>
    </div>
  );
}
