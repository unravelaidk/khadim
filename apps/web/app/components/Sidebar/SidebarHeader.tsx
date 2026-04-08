import KhadimLogo from "../../assets/Khadim-logo.svg";
import { LuPanelLeftClose, LuPanelLeftOpen, LuSquarePen } from "react-icons/lu";

interface SidebarHeaderProps {
  onCreateWorkspace: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function SidebarHeader({ onCreateWorkspace, isCollapsed = false, onToggleCollapse }: SidebarHeaderProps) {
  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-3 border-b border-[var(--glass-border)]">
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex w-11 h-11 items-center justify-center rounded-2xl btn-glass transition-all hover:scale-105"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <LuPanelLeftOpen className="w-[18px] h-[18px]" />
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--glass-border)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">
            <KhadimLogo />
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Khadim</span>
        </div>
        
        <div className="flex items-center gap-1.5">
          <button 
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] transition-all hover:bg-[#1c2214] hover:shadow-[var(--shadow-glass-md)]"
            onClick={onCreateWorkspace}
            title="New Chat"
            aria-label="New Chat"
          >
            <LuSquarePen className="w-4 h-4" />
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="hidden lg:flex h-8 w-8 items-center justify-center rounded-xl btn-glass transition-colors"
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
