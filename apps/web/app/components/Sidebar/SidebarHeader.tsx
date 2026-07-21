import { LuPanelLeftClose, LuPanelLeftOpen, LuSearch, LuSquarePen } from "react-icons/lu";

interface SidebarHeaderProps {
  onCreateWorkspace: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenCommandPalette?: () => void;
}

export function SidebarHeader({ onCreateWorkspace, isCollapsed = false, onToggleCollapse, onOpenCommandPalette }: SidebarHeaderProps) {
  if (isCollapsed) {
    return (
      <div className="electron-sidebar-title flex flex-col items-center gap-2 px-2 py-3">
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="electron-icon-button flex h-9 w-9 items-center justify-center"
            title="Search commands (Ctrl/⌘ K)"
            aria-label="Open command palette"
          >
            <LuSearch className="w-[18px] h-[18px]" />
          </button>
        )}
        <button
          onClick={onToggleCollapse}
          className="electron-icon-button hidden lg:flex w-9 h-9 items-center justify-center"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <LuPanelLeftOpen className="w-[18px] h-[18px]" />
        </button>
      </div>
    );
  }

  return (
    <div className="electron-sidebar-title px-4">
      <div className="flex items-center justify-between">
        <span>Project</span>
        
        <div className="flex items-center gap-1.5">
          <button 
            className="electron-icon-button w-8 h-8 flex items-center justify-center"
            onClick={onCreateWorkspace}
            title="New Chat"
            aria-label="New Chat"
          >
            <LuSquarePen className="w-4 h-4" />
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="electron-icon-button hidden lg:flex h-8 w-8 items-center justify-center"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <LuPanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
