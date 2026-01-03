import DexoLogo from "../../assets/Dexo-logo.svg";

interface SidebarHeaderProps {
  onCreateWorkspace: () => void;
}

export function SidebarHeader({ onCreateWorkspace }: SidebarHeaderProps) {
  return (
    <div className="gb-sidebar-header">
      <div className="gb-brand">
        <div className="w-12 h-12 flex items-center justify-center">
          <DexoLogo />
        </div>
        <span className="gb-brand-name">Dexo</span>
      </div>
      
      <button 
        className="gb-new-chat-btn" 
        onClick={onCreateWorkspace}
        title="New Chat"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <span className="sr-only">New Chat</span>
      </button>
    </div>
  );
}
