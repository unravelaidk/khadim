import { ScrollArea } from "../ui/scroll-area";
import type { Workspace } from "../workspace/workspace-types";
import { countFiles } from "../workspace/workspace-types";

interface SidebarChatListProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onClose?: () => void;
}

export function SidebarChatList({ 
  workspaces, 
  selectedWorkspaceId, 
  onSelectWorkspace, 
  onClose 
}: SidebarChatListProps) {
  return (
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
  );
}
