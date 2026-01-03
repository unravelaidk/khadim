import { SidebarHeader } from "./SidebarHeader";
import { SidebarNavigation } from "./SidebarNavigation";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarChatList } from "./SidebarChatList";

interface SidebarProps {
  selectedChatId: string | null;
  onSelectChat: (chatId: string | null) => void;
  onNewChat: () => void;
  onNavigate: (view: 'chat' | 'library') => void;
  isOpen?: boolean;
  onClose?: () => void;
  refreshKey?: number;
}

export function Sidebar({
  selectedChatId,
  onSelectChat,
  onNewChat,
  onNavigate,
  isOpen = true,
  onClose,
  refreshKey = 0,
}: SidebarProps) {
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity md:hidden ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={handleOverlayClick}
      />

      <aside className={`gb-sidebar z-50 transition-transform duration-300 ease-in-out md:translate-x-0 fixed md:relative ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <SidebarHeader onCreateWorkspace={onNewChat} />
        <SidebarNavigation onNavigate={onNavigate} />
        <SidebarProjects />
        <SidebarChatList 
          selectedChatId={selectedChatId}
          onSelectChat={onSelectChat}
          onNewChat={onNewChat}
          onClose={onClose}
          refreshKey={refreshKey}
        />
      </aside>
    </>
  );
}
