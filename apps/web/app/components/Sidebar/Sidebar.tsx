import { useState } from "react";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarNavigation } from "./SidebarNavigation";
import { SidebarChatList } from "./SidebarChatList";
import { SidebarAccount } from "./SidebarAccount";

interface SidebarProps {
  selectedChatId: string | null;
  selectedWorkspaceId?: string | null;
  onSelectChat: (chatId: string | null) => void;
  onNewChat: () => void;
  onNavigate: (view: "chat" | "workspace" | "settings") => void;
  currentView: "chat" | "workspace" | "settings";
  isOpen?: boolean;
  onClose?: () => void;
  refreshKey?: number;
  onOpenCommandPalette?: () => void;
}

export function Sidebar({
  selectedChatId,
  selectedWorkspaceId,
  onSelectChat,
  onNewChat,
  onNavigate,
  currentView,
  isOpen = false,
  onClose,
  refreshKey = 0,
  onOpenCommandPalette,
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <>
      {/* Mobile overlay */}
      <div 
        className={`fixed inset-0 z-40 bg-black/18 backdrop-blur-md transition-opacity lg:hidden ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={handleOverlayClick}
      />

      <aside className={`
        electron-sidebar fixed z-50 transition-transform duration-300 ease-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
        lg:relative lg:translate-x-0
        ${isCollapsed ? "lg:w-[64px]" : "lg:w-[282px]"}
        w-[282px] h-dvh lg:h-full top-0 lg:top-auto left-0 lg:left-auto
      `}>
        <div className="h-full flex flex-col overflow-hidden pointer-events-auto">
          {/* Header */}
          <SidebarHeader 
            onCreateWorkspace={() => {
              onNewChat();
              onClose?.();
            }}
            isCollapsed={isCollapsed}
            onToggleCollapse={handleToggleCollapse}
            onOpenCommandPalette={onOpenCommandPalette ? () => {
              onClose?.();
              onOpenCommandPalette();
            } : undefined}
          />

          {/* Navigation */}
          <SidebarNavigation 
            currentView={currentView} 
            onNavigate={(view) => {
              onNavigate(view);
              onClose?.();
            }}
            isCollapsed={isCollapsed}
          />

          {/* Chat list */}
          <SidebarChatList 
            selectedChatId={selectedChatId}
            selectedWorkspaceId={selectedWorkspaceId}
            currentView={currentView}
            onSelectChat={onSelectChat}
            onNewChat={onNewChat}
            onClose={onClose}
            refreshKey={refreshKey}
            isCollapsed={isCollapsed}
          />

          <SidebarAccount isCollapsed={isCollapsed} />
        </div>
      </aside>
    </>
  );
}
