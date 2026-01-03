import { ScrollArea } from "../ui/scroll-area";
import type { Workspace } from "./workspace-types";
import { countFiles } from "./workspace-types";
import DexoLogo from "../../assets/Dexo-logo.svg";

interface FileExplorerSidebarProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function FileExplorerSidebar({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  isOpen = true,
  onClose,
}: FileExplorerSidebarProps) {
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

        {/* Navigation */}
        <nav className="gb-nav">
          <button className="gb-nav-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <span>Search</span>
          </button>

          <button className="gb-nav-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>Library</span>
          </button>
        </nav>

        {/* Projects Section */}
        <div className="gb-section">
          <div className="gb-section-header">
            <span>Projects</span>
            <button className="gb-icon-btn-sm" title="New project">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          <button className="gb-nav-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <path d="M12 11v6M9 14h6" />
            </svg>
            <span>New project</span>
          </button>
        </div>

        <div className="gb-section gb-section-grow">
          <div className="gb-section-header">
            <span>All chats</span>
            <button className="gb-icon-btn-sm" title="Filter">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="8" y1="12" x2="16" y2="12" />
                <line x1="10" y1="18" x2="14" y2="18" />
              </svg>
            </button>
          </div>

          <ScrollArea className="gb-chat-list">
            {workspaces.map((workspace) => {
              const isSelected = workspace.id === selectedWorkspaceId;
              const fileCount = countFiles(workspace.files);

              return (
                <button
                  key={workspace.id}
                  className={`gb-chat-item ${isSelected ? "gb-chat-item-selected" : ""}`}
                  onClick={() => {
                     onSelectWorkspace(workspace.id);
                     if (onClose) onClose();
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14,2 14,8 20,8" />
                  </svg>
                  <span className="gb-chat-name">{workspace.name}</span>
                  {fileCount > 0 && (
                    <span className="gb-chat-badge">{fileCount}</span>
                  )}
                </button>
              );
            })}
          </ScrollArea>
        </div>
      </aside>
    </>
  );
}
