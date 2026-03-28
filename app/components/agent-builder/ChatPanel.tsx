import { useMemo, useState } from "react";
import { ChatInput } from "./ChatInput";
import { ChatInterface } from "./ChatInterface";
import { WelcomeScreen } from "./WelcomeScreen";
import { StickySlidePreview } from "./StickySlidePreview";
import type { RefObject } from "react";
import type { ActiveBadge } from "./hooks/useAgentBuilder";
import type { AttachedFile } from "./WelcomeScreen";
import type { Message, PendingQuestion } from "../../types/chat";

interface ChatPanelProps {
  messages: Message[];
  pendingQuestion: PendingQuestion | null;
  onAnswerQuestion: (answer: string) => void;
  onCancelQuestion: () => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isProcessing: boolean;
  activeAgent: { mode: "plan" | "build"; name: string } | null;
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
}

export function ChatPanel({
  messages,
  pendingQuestion,
  onAnswerQuestion,
  onCancelQuestion,
  messagesEndRef,
  input,
  onInputChange,
  onSend,
  onStop,
  isProcessing,
  activeAgent,
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
}: ChatPanelProps) {
  // Derive latest slide artifact + building state from messages
  const slideState = useMemo(() => {
    let latestContent: string | null = null;
    let isStreaming = false;
    let isBuilding = false;

    // Find latest slide content from any assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.fileContent?.includes('<script id="slide-data"')) {
        latestContent = msg.fileContent;
        isStreaming = (msg.thinkingSteps || []).some(s => s.status === "running");
        break;
      }
    }

    // Check if the agent is actively working on more slides
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    if (lastAssistant) {
      const hasRunningSteps = (lastAssistant.thinkingSteps || []).some(s => s.status === "running");
      if (hasRunningSteps) {
        const hasSlideToolRunning = (lastAssistant.thinkingSteps || []).some(
          s => s.status === "running" && (s.tool === "write_slides" || (s.tool === "write_file" && s.filename === "index.html"))
        );
        if (hasSlideToolRunning || latestContent) {
          // Agent has running steps and we have existing slides = building more
          isBuilding = true;
        }
      }
    }

    // If agent is processing and we already have slides, it's likely adding more
    if (isProcessing && latestContent) {
      isBuilding = true;
    }

    if (!latestContent && !isBuilding) return null;
    return { content: latestContent, isStreaming, isBuilding };
  }, [messages, isProcessing]);

  const [slideMinimized, setSlideMinimized] = useState(false);

  return (
    <>
      {/* Sticky slide preview panel */}
      {slideState && !isInitialState && (
        <StickySlidePreview
          content={slideState.content}
          isStreaming={slideState.isStreaming}
          isBuilding={slideState.isBuilding}
          isMinimized={slideMinimized}
          onToggleMinimize={() => setSlideMinimized(prev => !prev)}
          workspaceId={workspaceId}
        />
      )}

      <main
        className={`flex-1 overflow-y-auto ${
          isInitialState
            ? "flex items-center justify-center px-0 py-4 sm:py-6"
            : "px-2 pb-28 pt-4 sm:px-3 sm:pt-6 md:px-6 md:pb-36 md:pt-8"
        }`}
      >
        {!isInitialState && (
          <>
            <div className="mx-auto mb-4 flex w-full max-w-5xl justify-end px-1">
              {hasWorkspace ? (
                <button
                  onClick={onViewWorkspace}
                  className="border-2 border-black bg-black px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white transition-colors hover:bg-black/80"
                >
                  View workspace
                </button>
              ) : (
                <button
                  onClick={onStartWorkspace}
                  className="border-2 border-black bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-black transition-colors hover:bg-black hover:text-white"
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
          />
        )}
      </main>

      {!isInitialState && (
        <ChatInput
          value={input}
          onChange={onInputChange}
          onSend={onSend}
          onStop={onStop}
          isProcessing={isProcessing}
          activeAgent={activeAgent}
          isCompact={false}
          position="fixed"
        />
      )}
    </>
  );
}
