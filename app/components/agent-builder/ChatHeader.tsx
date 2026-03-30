import KhadimLogo from "../../assets/Khadim-logo.svg";
import { LuMenu } from "react-icons/lu";

interface ChatHeaderProps {
  onOpenSidebar: () => void;
}

export function ChatHeader({ onOpenSidebar }: ChatHeaderProps) {
  return (
    <div className="shrink-0 z-20 flex items-center justify-between border-b border-[var(--glass-border)] glass-panel-strong px-4 py-3 shadow-[var(--shadow-glass-sm)] transition-all duration-200 lg:hidden">
      <button
        onClick={onOpenSidebar}
        className="-ml-1.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] transition-colors duration-100 hover:bg-[#1c2214]"
        aria-label="Open Menu"
      >
        <LuMenu className="w-5 h-5" />
      </button>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <div className="w-8 h-8 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">
            <KhadimLogo />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)]">Khadim</span>
        </div>
      </div>
      
      <div className="w-10" />
    </div>
  );
}
