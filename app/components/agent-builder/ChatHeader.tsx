import { LuMenu } from "react-icons/lu";

interface ChatHeaderProps {
  onOpenSidebar: () => void;
}

export function ChatHeader({ onOpenSidebar }: ChatHeaderProps) {
  return (
    <div className="lg:hidden flex items-center px-4 pt-4 pb-1">
      <button
        onClick={onOpenSidebar}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl glass-panel text-[var(--text-primary)] shadow-[var(--shadow-glass-sm)] transition-all duration-200 hover:bg-[var(--glass-bg-strong)] border border-[var(--glass-border)]"
        aria-label="Open Menu"
      >
        <LuMenu className="w-5 h-5" />
      </button>
    </div>
  );
}
