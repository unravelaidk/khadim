import { LuMenu } from "react-icons/lu";

interface ChatHeaderProps {
  onOpenSidebar: () => void;
}

export function ChatHeader({ onOpenSidebar }: ChatHeaderProps) {
  return (
    <button
      onClick={onOpenSidebar}
      className="fixed top-4 left-4 z-50 lg:hidden inline-flex h-11 w-11 items-center justify-center rounded-2xl glass-panel text-[var(--text-primary)] shadow-[var(--shadow-glass-sm)] transition-all duration-200 hover:bg-[var(--glass-bg-strong)] border border-[var(--glass-border)]"
      aria-label="Open Menu"
    >
      <LuMenu className="w-5 h-5" />
    </button>
  );
}
