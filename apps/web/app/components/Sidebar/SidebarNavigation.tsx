import { LuFolderKanban, LuSearch, LuSettings2 } from "react-icons/lu";

type SidebarView = "chat" | "workspace" | "settings";

interface SidebarNavigationProps {
  currentView: SidebarView;
  onNavigate: (view: SidebarView) => void;
  isCollapsed?: boolean;
}

const navItems = [
  { id: "chat" as const, icon: LuSearch, label: "Welcome" },
  { id: "workspace" as const, icon: LuFolderKanban, label: "Projects" },
  { id: "settings" as const, icon: LuSettings2, label: "Settings" },
];

export function SidebarNavigation({ currentView, onNavigate, isCollapsed = false }: SidebarNavigationProps) {
  return (
    <nav className={`electron-primary-nav ${isCollapsed ? "p-2" : "px-3 pb-4"}`}>
      <div className={`flex ${isCollapsed ? "flex-col items-stretch" : "flex-col gap-1"}`}>
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`
                relative flex items-center gap-3 rounded-lg transition-all
                ${isCollapsed ? "justify-center p-2.5 mx-auto w-10 h-10" : "px-3 h-10"}
                ${isActive 
                  ? "active bg-[var(--surface-hover)] text-[var(--text)]"
                  : "text-[var(--text-2)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
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
