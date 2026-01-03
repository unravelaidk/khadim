import KhadimLogo from "../../assets/Khadim-logo.svg";
import { LuSquarePen } from "react-icons/lu";

interface SidebarHeaderProps {
  onCreateWorkspace: () => void;
}

export function SidebarHeader({ onCreateWorkspace }: SidebarHeaderProps) {
  return (
    <div className="gb-sidebar-header">
      <div className="gb-brand">
        <div className="w-12 h-12 flex items-center justify-center">
          <KhadimLogo />
        </div>
        <span className="gb-brand-name">Khadim</span>
      </div>
      
      <button 
        className="gb-new-chat-btn" 
        onClick={onCreateWorkspace}
        title="New Chat"
      >
        <LuSquarePen className="w-5 h-5" />
        <span className="sr-only">New Chat</span>
      </button>
    </div>
  );
}
