import type { RefObject } from "react";
import type { ChatMessage as StoredMessage, Conversation, OpenCodeModelOption, OpenCodeModelRef, Workspace, ThinkingStepData } from "../../lib/bindings";
import type { AgentInstance } from "../../lib/types";
import { ChatMessage, TypingIndicator } from "../ChatMessage";
import { ChatInput } from "../ChatInput";
import { ContextBar } from "../ContextBar";
import { ModifiedFilesPanel } from "../ModifiedFilesPanel";
import { WelcomeScreen } from "../WelcomeScreen";

function getModelKey(model: OpenCodeModelRef) {
  return `${model.provider_id}:${model.model_id}`;
}

interface AgentChatViewProps {
  focusedAgent: AgentInstance | null;
  activeConversation: Conversation | null;
  selectedModelLabel: string | null;
  onNewConversation: () => void;
  messages: StoredMessage[];
  selectedWorkspace: Workspace | null;
  isProcessing: boolean;
  streamingContent: string;
  streamingSteps: ThinkingStepData[];
  selectedConversationId: string | null;
  chatEndRef: RefObject<HTMLDivElement | null>;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  availableModels: OpenCodeModelOption[];
  selectedModel: OpenCodeModelRef | null;
  onSelectModel: (key: string) => void;
  onOpenFile: (path: string) => void;
}

export function AgentChatView({
  focusedAgent,
  activeConversation,
  selectedModelLabel,
  onNewConversation,
  messages,
  selectedWorkspace,
  isProcessing,
  streamingContent,
  streamingSteps,
  selectedConversationId,
  chatEndRef,
  input,
  onInputChange,
  onSend,
  onStop,
  availableModels,
  selectedModel,
  onSelectModel,
  onOpenFile,
}: AgentChatViewProps) {
  const basePath = selectedWorkspace?.worktree_path ?? selectedWorkspace?.repo_path;

  return (
    <div className="relative flex flex-col overflow-hidden" style={{ flex: "1 1 0%", minHeight: 0 }}>
      <div className="shrink-0 px-6 py-3 border-b border-[var(--glass-border)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {focusedAgent ? (
            <div className={`w-2 h-2 rounded-full shrink-0 ${
              focusedAgent.status === "running" ? "bg-[var(--color-accent)] animate-pulse"
                : focusedAgent.status === "complete" ? "bg-[var(--color-success)]"
                : focusedAgent.status === "error" ? "bg-[var(--color-danger)]"
                : "bg-[var(--scrollbar-thumb)]"
            }`} />
          ) : null}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{focusedAgent?.label ?? activeConversation?.title ?? "Chat"}</h2>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {focusedAgent?.currentActivity ?? (activeConversation ? (activeConversation.title ?? "Active conversation") : "No conversation")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedModelLabel ? (
            <span className="inline-flex items-center gap-1.5 rounded-full glass-panel px-2.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
              {selectedModelLabel}
            </span>
          ) : null}
          <button onClick={onNewConversation} className="h-7 px-2.5 rounded-xl text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]">
            New
          </button>
        </div>
      </div>

      <ContextBar agent={focusedAgent} isStreaming={isProcessing} />

      <main className={`min-h-0 flex-1 overflow-y-auto scrollbar-thin ${messages.length === 0 && !isProcessing ? "px-0 py-6" : "pb-36 pt-3 sm:pb-44 md:pb-52 md:pt-6"}`}>
        {messages.length === 0 && !isProcessing ? (
          <WelcomeScreen input={input} setInput={onInputChange} onSend={onSend} compact hideInput />
        ) : (
          <div className="mx-auto flex max-w-6xl gap-4 px-4 md:px-6">
            <div className="min-w-0 flex-1 max-w-3xl">
              <div className="rounded-3xl p-5 glass-card-static">
                <div className="space-y-5">
                  {messages.map((message) => (
                    <ChatMessage key={message.id} message={message} basePath={basePath} />
                  ))}
                  {isProcessing && (streamingContent || streamingSteps.length > 0) ? (
                    <ChatMessage
                      message={{
                        id: "__streaming__",
                        conversation_id: selectedConversationId ?? "",
                        role: "assistant",
                        content: streamingContent,
                        metadata: null,
                        created_at: new Date().toISOString(),
                        thinkingSteps: streamingSteps,
                      }}
                      isStreaming
                      basePath={basePath}
                    />
                  ) : null}
                  {isProcessing && !streamingContent && streamingSteps.length === 0 ? <TypingIndicator /> : null}
                  <div ref={chatEndRef} />
                </div>
              </div>
            </div>

            <div className="hidden xl:block w-[260px] shrink-0 sticky top-0 self-start">
              <ModifiedFilesPanel repoPath={basePath} isStreaming={isProcessing} onOpenFile={onOpenFile} />
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
