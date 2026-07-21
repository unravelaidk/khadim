import { LuBot, LuFileText, LuMenu, LuMessageCircle, LuSearch, LuSettings2, LuSquarePen } from "react-icons/lu";
import KhadimLogo from "../../assets/Khadim-logo.svg";

interface ChatHeaderProps {
  onOpenSidebar: () => void;
  onNewChat?: () => void;
  currentView: "chat" | "workspace" | "settings";
  onNavigate: (view: "chat" | "workspace" | "settings") => void;
  onOpenCommandPalette: () => void;
}

export function ChatHeader({ onOpenSidebar, onNewChat, currentView, onNavigate, onOpenCommandPalette }: ChatHeaderProps) {
  return (
    <header className="electron-header">
      <button
        onClick={onOpenSidebar}
        className="electron-header-menu"
        aria-label="Open menu"
      >
        <LuMenu size={18} />
      </button>
      <button className="electron-header-logo" onClick={() => onNavigate("chat")} aria-label="Khadim home">
        <span>
          <KhadimLogo />
        </span>
      </button>
      <nav className="electron-mode-nav" aria-label="Work modes">
        <button className={currentView === "chat" ? "active" : ""} onClick={() => onNavigate("chat")}><LuMessageCircle size={16} /><span>Chat</span></button>
        <button className={currentView === "workspace" ? "active" : ""} onClick={() => onNavigate("workspace")}><LuBot size={16} /><span>Projects</span></button>
        <button onClick={() => onNavigate("workspace")}><LuFileText size={16} /><span>Studio</span></button>
      </nav>
      <button className="electron-command-trigger" onClick={onOpenCommandPalette}>
        <LuSearch size={15} /><span>Search chats, projects, and commands</span><kbd>Ctrl K</kbd>
      </button>
      <div className="electron-header-actions">
        {onNewChat && <button onClick={onNewChat} aria-label="New chat" title="New chat"><LuSquarePen size={17} /></button>}
        <button className={currentView === "settings" ? "active" : ""} onClick={() => onNavigate("settings")} aria-label="Settings"><LuSettings2 size={18} /></button>
        <span className="electron-account-avatar">K</span>
      </div>
    </header>
  );
}
