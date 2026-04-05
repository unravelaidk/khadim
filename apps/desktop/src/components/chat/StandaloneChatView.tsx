import { useMemo, type RefObject } from "react";
import type { OpenCodeModelOption, OpenCodeModelRef, ThinkingStepData } from "../../lib/bindings";
import type { LocalChatConversation } from "../../lib/types";
import { ChatMessage, TypingIndicator } from "../ChatMessage";
import { ChatInput } from "../ChatInput";
import { WelcomeScreen } from "../WelcomeScreen";

function getModelKey(model: OpenCodeModelRef) {
  return `${model.provider_id}:${model.model_id}`;
}

function findSelectedModelOption(models: OpenCodeModelOption[], selected: OpenCodeModelRef | null) {
  if (!selected) return null;
  return models.find((model) => getModelKey(model) === getModelKey(selected)) ?? null;
}

interface StandaloneChatViewProps {
  activeChatConv: LocalChatConversation | null;
  chatDirectory: string | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onNewChat: () => void;
  isProcessing: boolean;
  streamingContent: string;
  streamingSteps: ThinkingStepData[];
  availableModels: OpenCodeModelOption[];
  selectedModel: OpenCodeModelRef | null;
  onSelectModel: (key: string) => void;
  chatEndRef: RefObject<HTMLDivElement | null>;
}

export function StandaloneChatView({
  activeChatConv,
  chatDirectory,
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
}: StandaloneChatViewProps) {
  const chatMessages = activeChatConv?.messages ?? [];
  const displayMessages = useMemo(
    () => chatMessages.map((message) => ({
      id: message.id,
      conversation_id: activeChatConv?.id ?? "",
      role: message.role,
      content: message.content,
      metadata: null,
      created_at: message.createdAt,
      thinkingSteps: message.thinkingSteps,
    })),
    [activeChatConv?.id, chatMessages],
  );
  const chatModelOption = findSelectedModelOption(availableModels, selectedModel);
  const chatModelLabel = chatModelOption
    ? `${chatModelOption.provider_name} / ${chatModelOption.model_name}`
    : selectedModel
      ? `${selectedModel.provider_id} / ${selectedModel.model_id}`
      : null;
  const hasContent = chatMessages.length > 0 || isProcessing;

  return (
    <div className="relative flex flex-col overflow-hidden" style={{ flex: "1 1 0%", minHeight: 0 }}>
      <div className="shrink-0 px-6 py-3 border-b border-[var(--glass-border)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {isProcessing ? <div className="w-2 h-2 rounded-full shrink-0 bg-[var(--color-accent)] animate-pulse" /> : null}
          <svg className="w-4 h-4 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{activeChatConv?.title ?? "Chat"}</h2>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
              {chatDirectory
                ? <><span className="opacity-60">cwd:</span>{" "}<span title={chatDirectory}>{chatDirectory}</span></>
                : activeChatConv ? `${chatMessages.length} messages` : "Start a new conversation"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {chatModelLabel ? (
            <span className="inline-flex items-center gap-1.5 rounded-full glass-panel px-2.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
              {chatModelLabel}
            </span>
          ) : null}
          <button onClick={onNewChat} className="h-7 px-2.5 rounded-xl text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]">
            New
          </button>
        </div>
      </div>

      <main className={`min-h-0 flex-1 overflow-y-auto scrollbar-thin ${!hasContent ? "px-0 py-6" : "pb-36 pt-3 sm:pb-44 md:pb-52 md:pt-6"}`}>
        {!hasContent ? (
          <WelcomeScreen input={input} setInput={onInputChange} onSend={onSend} compact hideInput />
        ) : (
          <div className="mx-auto flex max-w-3xl gap-4 px-4 md:px-6">
            <div className="min-w-0 flex-1">
              <div className="rounded-3xl p-5 glass-card-static">
                <div className="space-y-5">
                  {displayMessages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                  ))}
                  {isProcessing && (streamingContent || streamingSteps.length > 0) ? (
                    <ChatMessage
                      message={{
                        id: "__chat-streaming__",
                        conversation_id: activeChatConv?.id ?? "",
                        role: "assistant",
                        content: streamingContent,
                        metadata: null,
                        created_at: new Date().toISOString(),
                        thinkingSteps: streamingSteps,
                      }}
                      isStreaming
                    />
                  ) : null}
                  {isProcessing && !streamingContent && streamingSteps.length === 0 ? <TypingIndicator /> : null}
                  <div ref={chatEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
        <div className="h-8 sm:h-16 bg-gradient-to-t from-[var(--surface-bg)] to-transparent" />
        <div className="pointer-events-auto bg-[var(--surface-bg)]">
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
    </div>
  );
}
