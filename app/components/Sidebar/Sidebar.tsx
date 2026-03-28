import { useState } from "react";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarNavigation } from "./SidebarNavigation";
import { SidebarChatList } from "./SidebarChatList";

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
}

export function Sidebar({
  selectedChatId,
  selectedWorkspaceId,
  onSelectChat,
  onNewChat,
  onNavigate,
  currentView,
  isOpen = true,
  onClose,
  refreshKey = 0,
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
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity lg:hidden ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={handleOverlayClick}
      />

      {/* Sidebar */}
      <aside className={`
        fixed z-50 transition-all duration-200 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
        lg:relative lg:translate-x-0
        ${isCollapsed ? "lg:w-[60px]" : "lg:w-[260px]"}
        w-[260px]
      `}>
        <div className="h-screen bg-white border-r-2 border-black flex flex-col shadow-gb-md">
          {/* Header */}
          <SidebarHeader 
            onCreateWorkspace={onNewChat} 
            isCollapsed={isCollapsed}
            onToggleCollapse={handleToggleCollapse}
          />

          {/* Navigation */}
          <SidebarNavigation 
            currentView={currentView} 
            onNavigate={onNavigate}
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
        </div>
      </aside>
    </>
  );
}
