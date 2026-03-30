import { AgentBuilderShell } from "./agent-builder/AgentBuilderShell";
import { ChatPanel } from "./agent-builder/ChatPanel";
import { AgentHubPanel } from "./agent-builder/AgentHubPanel";
import { SettingsPanel } from "./agent-builder/SettingsPanel";
import { ChatHeader } from "./agent-builder/ChatHeader";
import { PreviewModal } from "./agent-builder/PreviewModal";
import { Sidebar } from "./Sidebar/Sidebar";
import { useAgentBuilder } from "./agent-builder/hooks/useAgentBuilder";

interface AgentBuilderProps {
  initialChatId?: string;
  initialView?: "chat" | "workspace";
  initialWorkspaceId?: string;
}

export function AgentBuilder({ initialChatId, initialView = "chat", initialWorkspaceId }: AgentBuilderProps) {
  const { state, actions } = useAgentBuilder({ initialChatId, initialView, initialWorkspaceId });
  const handlePrimaryCreate =
    state.currentView === "workspace" && state.selectedWorkspaceId
      ? () => void actions.handleCreateChatInWorkspace()
      : actions.handleNewChat;

  return (
    <AgentBuilderShell
      sidebar={
        <Sidebar
          selectedChatId={state.chatId}
          selectedWorkspaceId={state.selectedWorkspaceId}
          onSelectChat={actions.handleSelectChat}
          onNewChat={handlePrimaryCreate}
          refreshKey={state.sidebarRefreshKey}
          onNavigate={actions.handleNavigate}
          currentView={state.currentView}
          isOpen={state.isSidebarOpen}
          onClose={() => actions.setIsSidebarOpen(false)}
        />
      }
      header={<ChatHeader onOpenSidebar={() => actions.setIsSidebarOpen(true)} />}
      content={
        state.currentView === "workspace" ? (
          <AgentHubPanel
            selectedWorkspaceId={state.selectedWorkspaceId}
            onSelectWorkspace={actions.handleSelectWorkspace}
            onSelectChat={actions.handleSelectChat}
            onCreateWorkspace={actions.handleOpenWorkspace}
            onCreateChatInWorkspace={actions.handleCreateChatInWorkspace}
          />
        ) : state.currentView === "settings" ? (
          <SettingsPanel />
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
            isInitialState={state.isInitialState}
            activeBadges={state.activeBadges}
            removeBadge={actions.removeBadge}
            updateSlideCount={actions.updateSlideCount}
            onSuggestionClick={actions.handleSuggestionClick}
            attachedFiles={state.attachedFiles}
            onFilesAttached={actions.setAttachedFiles}
            onRemoveFile={actions.removeAttachedFile}
            onStartWorkspace={() => void actions.handleOpenWorkspace()}
            onViewWorkspace={() => void actions.handleOpenWorkspace()}
            hasWorkspace={Boolean(state.selectedWorkspaceId)}
            workspaceId={state.selectedWorkspaceId}
            availableModels={state.availableModels}
            selectedModelId={state.selectedModelId}
            isModelLoading={state.isModelLoading}
            isModelUpdating={state.isModelUpdating}
            onSelectModel={actions.handleSelectModel}
            webBrowsingEnabled={state.webBrowsingEnabled}
            onToggleWebBrowsing={actions.setWebBrowsingEnabled}
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
