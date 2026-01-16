import { ChatInput } from "./ChatInput";
import { ChatInterface } from "./ChatInterface";
import { WelcomeScreen } from "./WelcomeScreen";
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
}: ChatPanelProps) {
  return (
    <>
      <main
        className={`flex-1 overflow-y-auto ${
          isInitialState
            ? "flex items-center justify-center py-6"
            : "pt-6 pb-28 px-3 md:pt-8 md:pb-36 md:px-4"
        }`}
      >
        {!isInitialState && (
          <ChatInterface
            messages={messages}
            pendingQuestion={pendingQuestion}
            onAnswerQuestion={onAnswerQuestion}
            onCancelQuestion={onCancelQuestion}
            messagesEndRef={messagesEndRef}
          />
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
