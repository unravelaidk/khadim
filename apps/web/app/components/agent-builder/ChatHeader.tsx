import { LuMenu, LuSquarePen } from "react-icons/lu";
import KhadimLogo from "../../assets/Khadim-logo.svg";

interface ChatHeaderProps {
  onOpenSidebar: () => void;
  onNewChat?: () => void;
}

export function ChatHeader({ onOpenSidebar, onNewChat }: ChatHeaderProps) {
  return (
    <header className="lg:hidden relative z-30 flex items-center justify-between gap-3 px-4 pt-4 pb-2">
      {/* Left: Menu trigger */}
      <button
        onClick={onOpenSidebar}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl glass-panel text-[var(--text-primary)] transition-all duration-200 hover:bg-[var(--glass-bg-strong)]"
        aria-label="Open menu"
      >
        <LuMenu className="w-[18px] h-[18px]" />
      </button>

      {/* Center: Logo + wordmark */}
      <div className="flex items-center gap-2 select-none">
        <div className="w-7 h-7 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">
          <KhadimLogo />
        </div>
        <span className="text-base font-bold tracking-tight text-[var(--text-primary)]">
          Khadim
        </span>
      </div>

      {/* Right: New chat */}
      {onNewChat ? (
        <button
          onClick={onNewChat}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] transition-all duration-200 hover:bg-[#1c2214] hover:shadow-[var(--shadow-glass-md)]"
          aria-label="New chat"
          title="New chat"
        >
          <LuSquarePen className="w-4 h-4" />
        </button>
      ) : (
        /* Spacer to keep logo centered */
        <div className="w-9 shrink-0" />
      )}
    </header>
  );
}
