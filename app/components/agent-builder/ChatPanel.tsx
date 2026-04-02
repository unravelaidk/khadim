import { useEffect, useMemo, useState } from "react";
import { ChatInput } from "./ChatInput";
import { ChatInterface } from "./ChatInterface";
import { WelcomeScreen } from "./WelcomeScreen";
import { StickySlidePreview } from "./StickySlidePreview";
import type { RefObject } from "react";
import type { ActiveBadge } from "./hooks/useAgentBuilder";
import type { AttachedFile } from "./WelcomeScreen";
import type { ModelOption } from "./ModelSelector";
import type { Message, PendingQuestion } from "../../types/chat";
import type { SlideRuntimeView } from "./hooks/agent-session-state";

interface ChatPanelProps {
  messages: Message[];
  slideState: SlideRuntimeView | null;
  pendingQuestion: PendingQuestion | null;
  onAnswerQuestion: (answer: string) => void;
  onCancelQuestion: () => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isProcessing: boolean;
  isInitialState: boolean;
  activeBadges: ActiveBadge[];
  removeBadge: (label: string) => void;
  updateSlideCount: (label: string, count: number) => void;
  onSuggestionClick: (feature: ActiveBadge) => void;
  attachedFiles: AttachedFile[];
  onFilesAttached: (files: AttachedFile[]) => void;
  onRemoveFile: (fileName: string) => void;
  onStartWorkspace: () => void;
  onViewWorkspace: () => void;
  hasWorkspace: boolean;
  workspaceId?: string | null;
  availableModels: ModelOption[];
  selectedModelId: string | null;
  isModelLoading: boolean;
  isModelUpdating: boolean;
  onSelectModel: (modelId: string) => Promise<void>;
  webBrowsingEnabled: boolean;
  onToggleWebBrowsing: (enabled: boolean) => void;
}

export function ChatPanel({
  messages,
  slideState,
  pendingQuestion,
  onAnswerQuestion,
  onCancelQuestion,
  messagesEndRef,
  input,
  onInputChange,
  onSend,
  onStop,
  isProcessing,
  isInitialState,
  activeBadges,
  removeBadge,
  updateSlideCount,
  onSuggestionClick,
  attachedFiles,
  onFilesAttached,
  onRemoveFile,
  onStartWorkspace,
  onViewWorkspace,
  hasWorkspace,
  workspaceId,
  availableModels,
  selectedModelId,
  isModelLoading,
  isModelUpdating,
  onSelectModel,
  webBrowsingEnabled,
  onToggleWebBrowsing,
}: ChatPanelProps) {
  const [slideMinimized, setSlideMinimized] = useState(false);
  const [selectedSlideContent, setSelectedSlideContent] = useState<string | null>(null);
  const latestMessageSlideContent = useMemo(
    () => [...messages].reverse().find((message) => message.fileContent?.includes('<script id="slide-data"'))?.fileContent || null,
    [messages],
  );

  useEffect(() => {
    if (!slideState?.content && !latestMessageSlideContent) {
      setSelectedSlideContent(null);
      return;
    }

    setSelectedSlideContent((current) => current || slideState?.content || latestMessageSlideContent || null);
  }, [latestMessageSlideContent, slideState?.content]);

  const previewContent = selectedSlideContent || slideState?.content || latestMessageSlideContent || null;
  const isActivelyBuilding = slideState?.isBuilding ?? false;
  const previewIsBuilding = previewContent && slideState?.content === previewContent ? slideState.isBuilding : isActivelyBuilding;
  const previewIsStreaming = previewContent && slideState?.content === previewContent ? slideState.isStreaming : false;
  const shouldShowSlidePreview = !!(previewContent || isActivelyBuilding);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Sticky slide preview panel */}
      {shouldShowSlidePreview && !isInitialState && (
        <StickySlidePreview
          content={previewContent}
          isStreaming={previewIsStreaming}
          isBuilding={previewIsBuilding}
          isMinimized={slideMinimized}
          onToggleMinimize={() => setSlideMinimized(prev => !prev)}
          workspaceId={workspaceId}
        />
      )}

      <main
        className={`min-h-0 flex-1 overflow-y-auto ${
          isInitialState
            ? "flex items-start justify-center px-0 py-6 sm:py-8 lg:py-10"
            : "px-2 pb-36 pt-3 sm:px-3 sm:pb-44 sm:pt-6 md:px-6 md:pb-52 md:pt-8"
        }`}
      >
        {!isInitialState && (
          <>
            <div className="mx-auto mb-4 flex w-full max-w-5xl justify-end px-1">
              {hasWorkspace ? (
                <button
                  onClick={onViewWorkspace}
                  className="btn-ink rounded-full px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
                >
                  View workspace
                </button>
              ) : (
                <button
                  onClick={onStartWorkspace}
                  className="btn-glass rounded-full px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
                >
                  Start workspace
                </button>
              )}
            </div>
            <ChatInterface
              messages={messages}
              pendingQuestion={pendingQuestion}
              onAnswerQuestion={onAnswerQuestion}
              onCancelQuestion={onCancelQuestion}
              messagesEndRef={messagesEndRef}
              workspaceId={workspaceId}
              selectedSlideContent={selectedSlideContent}
              onSelectSlideContent={setSelectedSlideContent}
            />
          </>
        )}

        {isInitialState && (
          <WelcomeScreen
            input={input}
            setInput={onInputChange}
            handleSend={onSend}
            activeBadges={activeBadges}
            removeBadge={removeBadge}
            onUpdateSlideCount={updateSlideCount}
            onSuggestionClick={onSuggestionClick}
            attachedFiles={attachedFiles}
            onFilesAttached={onFilesAttached}
            onRemoveFile={onRemoveFile}
            onStartWorkspace={hasWorkspace ? undefined : onStartWorkspace}
            availableModels={availableModels}
            selectedModelId={selectedModelId}
            isModelLoading={isModelLoading}
            isModelUpdating={isModelUpdating}
            onSelectModel={onSelectModel}
            webBrowsingEnabled={webBrowsingEnabled}
            onToggleWebBrowsing={onToggleWebBrowsing}
          />
        )}
      </main>

      {!isInitialState && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
          {/* Fade gradient overlay */}
          <div className="h-8 sm:h-16 bg-gradient-to-t from-[var(--surface-bg)] to-transparent" />
          <div className="pointer-events-auto bg-[var(--surface-bg)]">
            <ChatInput
              value={input}
              onChange={onInputChange}
              onSend={onSend}
              onStop={onStop}
              isProcessing={isProcessing}
              isCompact={false}
              position="relative"
              availableModels={availableModels}
              selectedModelId={selectedModelId}
              isModelLoading={isModelLoading}
              isModelUpdating={isModelUpdating}
              onSelectModel={onSelectModel}
              webBrowsingEnabled={webBrowsingEnabled}
              onToggleWebBrowsing={onToggleWebBrowsing}
            />
          </div>
        </div>
      )}
    </div>
  );
}
