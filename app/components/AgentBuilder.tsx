import { AgentBuilderShell } from "./agent-builder/AgentBuilderShell";
import { ChatPanel } from "./agent-builder/ChatPanel";
import { LibraryPanel } from "./agent-builder/LibraryPanel";
import { ChatHeader } from "./agent-builder/ChatHeader";
import { PreviewModal } from "./agent-builder/PreviewModal";
import { Sidebar } from "./Sidebar/Sidebar";
import { useAgentBuilder } from "./agent-builder/hooks/useAgentBuilder";

interface AgentBuilderProps {
  initialChatId?: string;
}

export function AgentBuilder({ initialChatId }: AgentBuilderProps) {
  const { state, actions } = useAgentBuilder({ initialChatId });

  return (
    <AgentBuilderShell
      sidebar={
        <Sidebar
          selectedChatId={state.chatId}
          onSelectChat={actions.handleSelectChat}
          onNewChat={actions.handleNewChat}
          refreshKey={state.sidebarRefreshKey}
          onNavigate={actions.setCurrentView}
          isOpen={state.isSidebarOpen}
          onClose={() => actions.setIsSidebarOpen(false)}
        />
      }
      header={<ChatHeader onOpenSidebar={() => actions.setIsSidebarOpen(true)} />}
      content={
        state.currentView === "library" ? (
          <LibraryPanel workspaces={state.workspaces} onSelectWorkspace={actions.handleSelectWorkspace} />
        ) : (
          <ChatPanel
            messages={state.messages}
            pendingQuestion={state.pendingQuestion}
            onAnswerQuestion={actions.handleAnswerQuestion}
            onCancelQuestion={actions.clearPendingQuestion}
            messagesEndRef={state.messagesEndRef}
            input={state.input}
            onInputChange={actions.setInput}
            onSend={actions.handleSend}
            onStop={actions.handleStop}
            isProcessing={state.isProcessing}
            activeAgent={state.activeAgent}
            isInitialState={state.isInitialState}
            activeBadges={state.activeBadges}
            removeBadge={actions.removeBadge}
            updateSlideCount={actions.updateSlideCount}
            onSuggestionClick={actions.handleSuggestionClick}
            attachedFiles={state.attachedFiles}
            onFilesAttached={actions.setAttachedFiles}
            onRemoveFile={actions.removeAttachedFile}
          />
        )
      }
      footer={
        state.agentConfig ? (
          <PreviewModal
            agentConfig={state.agentConfig}
            isOpen={state.showPreview}
            onClose={() => actions.setShowPreview(false)}
            onDeploy={() => actions.setShowPreview(false)}
          />
        ) : null
      }
    />
  );
}
