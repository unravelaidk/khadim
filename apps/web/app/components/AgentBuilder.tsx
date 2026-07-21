import { useEffect, useMemo, useState } from "react";
import { AgentBuilderShell } from "./agent-builder/AgentBuilderShell";
import { ChatPanel } from "./agent-builder/ChatPanel";
import { AgentHubPanel } from "./agent-builder/AgentHubPanel";
import { SettingsPanel } from "./agent-builder/SettingsPanel";
import { ChatHeader } from "./agent-builder/ChatHeader";
import { PreviewModal } from "./agent-builder/PreviewModal";
import { Sidebar } from "./Sidebar/Sidebar";
import { useAgentBuilder } from "./agent-builder/hooks/useAgentBuilder";
import { CommandPalette, createResourceCommandActions, createShellCommandActions, type CommandPaletteResource } from "./CommandPalette";

interface AgentBuilderProps {
  initialChatId?: string;
  initialView?: "chat" | "workspace" | "settings";
  initialWorkspaceId?: string;
}

export function AgentBuilder({ initialChatId, initialView = "chat", initialWorkspaceId }: AgentBuilderProps) {
  const { state, actions } = useAgentBuilder({ initialChatId, initialView, initialWorkspaceId });
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [paletteChats, setPaletteChats] = useState<CommandPaletteResource[]>([]);
  const [paletteProjects, setPaletteProjects] = useState<CommandPaletteResource[]>([]);
  const handlePrimaryCreate =
    state.currentView === "workspace" && state.selectedWorkspaceId
      ? () => void actions.handleCreateChatInWorkspace()
      : actions.handleNewChat;
  const commandActions = useMemo(() => [
    ...createShellCommandActions({
      newChat: actions.handleNewChat,
      showChats: () => actions.handleNavigate("chat"),
      showProjects: () => actions.handleNavigate("workspace"),
      showSettings: () => actions.handleNavigate("settings"),
    }),
    ...createResourceCommandActions({
      chats: paletteChats,
      projects: paletteProjects,
      openChat: (id) => void actions.handleSelectChat(id),
      openProject: actions.handleSelectWorkspace,
    }),
  ], [actions.handleNewChat, actions.handleNavigate, actions.handleSelectChat, actions.handleSelectWorkspace, paletteChats, paletteProjects]);

  useEffect(() => {
    if (!isCommandPaletteOpen) return;
    const controller = new AbortController();
    void Promise.allSettled([
      fetch("/api/chats", { signal: controller.signal }).then((response) => response.ok ? response.json() : { chats: [] }),
      fetch("/api/workspaces", { signal: controller.signal }).then((response) => response.ok ? response.json() : { workspaces: [] }),
    ]).then(([chatResult, projectResult]) => {
      if (controller.signal.aborted) return;
      setPaletteChats(chatResult.status === "fulfilled"
        ? (chatResult.value.chats ?? []).map((chat: { id: string; title: string | null }) => ({ id: chat.id, title: chat.title }))
        : []);
      setPaletteProjects(projectResult.status === "fulfilled"
        ? (projectResult.value.workspaces ?? []).map((project: { id: string; name: string | null }) => ({ id: project.id, title: project.name }))
        : []);
    });
    return () => controller.abort();
  }, [isCommandPaletteOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k" && state.currentView !== "settings") {
        event.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "n" && state.currentView !== "settings" && !isCommandPaletteOpen && !state.showPreview) {
        event.preventDefault();
        actions.handleNewChat();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions.handleNewChat, isCommandPaletteOpen, state.currentView, state.showPreview]);

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
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />
      }
      header={
        <ChatHeader
          onOpenSidebar={() => actions.setIsSidebarOpen(true)}
          onNewChat={handlePrimaryCreate}
          currentView={state.currentView}
          onNavigate={actions.handleNavigate}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />
      }
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
            slideState={state.slideState}
            pendingQuestions={state.pendingQuestions}
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
            hasWorkspace={state.hasWorkspace}
            workspaceId={state.selectedWorkspaceId}
            availableModels={state.availableModels}
            selectedModelId={state.selectedModelId}
            isModelLoading={state.isModelLoading}
            isModelUpdating={state.isModelUpdating}
            onSelectModel={actions.handleSelectModel}
            webBrowsingEnabled={state.webBrowsingEnabled}
            onToggleWebBrowsing={actions.setWebBrowsingEnabled}
            systemPrompt={state.systemPrompt}
            onSystemPromptChange={actions.setSystemPrompt}
          />
        )
      }
      footer={
        <>
          {state.agentConfig ? (
            <PreviewModal
              agentConfig={state.agentConfig}
              isOpen={state.showPreview}
              onClose={() => actions.setShowPreview(false)}
              onDeploy={() => actions.setShowPreview(false)}
            />
          ) : null}
          <CommandPalette
            open={isCommandPaletteOpen}
            onOpenChange={setIsCommandPaletteOpen}
            actions={commandActions}
          />
        </>
      }
    />
  );
}
