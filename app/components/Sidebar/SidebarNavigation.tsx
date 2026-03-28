import { LuFolderKanban, LuSearch, LuSettings2 } from "react-icons/lu";

type SidebarView = "chat" | "workspace" | "settings";

interface SidebarNavigationProps {
  currentView: SidebarView;
  onNavigate: (view: SidebarView) => void;
  isCollapsed?: boolean;
}

const navItems = [
  { id: "chat" as const, icon: LuSearch, label: "Chats" },
  { id: "workspace" as const, icon: LuFolderKanban, label: "Workspace" },
  { id: "settings" as const, icon: LuSettings2, label: "Settings" },
];

export function SidebarNavigation({ currentView, onNavigate, isCollapsed = false }: SidebarNavigationProps) {
  return (
    <nav className={`border-b-2 border-black ${isCollapsed ? "p-2" : "p-3"}`}>
      <div className={`flex ${isCollapsed ? "flex-col items-stretch" : "flex-col gap-1"}`}>
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`
                flex items-center gap-3 transition-all
                ${isCollapsed ? "justify-center p-3" : "px-3 py-2"}
                ${isActive 
                  ? "bg-black text-white" 
                  : "text-black/70 hover:bg-black/5 hover:text-black"
                }
              `}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {!isCollapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
