import KhadimLogo from "../../assets/Khadim-logo.svg";
import { LuPanelLeftClose, LuPanelLeftOpen, LuSquarePen } from "react-icons/lu";

interface SidebarHeaderProps {
  onCreateWorkspace: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function SidebarHeader({ onCreateWorkspace, isCollapsed = false, onToggleCollapse }: SidebarHeaderProps) {
  return (
    <div className={`border-b-2 border-black bg-white ${isCollapsed ? "p-3" : "p-4"}`}>
      <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"}`}>
        <div className={`flex items-center ${isCollapsed ? "" : "gap-3"}`}>
          <div className="w-10 h-10 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">
            <KhadimLogo />
          </div>
          {!isCollapsed && (
            <span className="text-xl font-bold tracking-tight text-black">Khadim</span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <button 
              className="w-8 h-8 flex items-center justify-center border-2 border-black bg-white text-black hover:bg-black hover:text-white transition-colors"
              onClick={onCreateWorkspace}
              title="New Chat"
              aria-label="New Chat"
            >
              <LuSquarePen className="w-4 h-4" />
            </button>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="hidden lg:flex h-8 w-8 items-center justify-center border-2 border-black bg-white text-black hover:bg-black hover:text-white transition-colors"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <LuPanelLeftOpen className="w-4 h-4" /> : <LuPanelLeftClose className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
