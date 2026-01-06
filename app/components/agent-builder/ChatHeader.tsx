import KhadimLogo from "../../assets/Khadim-logo.svg";
import { LuMenu } from "react-icons/lu";

interface ChatHeaderProps {
  onOpenSidebar: () => void;
}

export function ChatHeader({ onOpenSidebar }: ChatHeaderProps) {
  return (
    <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-gb-border bg-gb-bg/80 backdrop-blur-md sticky top-0 z-20 transition-all duration-200">
      <button
        onClick={onOpenSidebar}
        className="p-2 -ml-2 rounded-lg text-gb-text-secondary hover:bg-gb-bg-subtle hover:text-gb-text transition-colors active:scale-95 duration-100"
        aria-label="Open Menu"
      >
        <LuMenu className="w-6 h-6" />
      </button>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <div className="w-8 h-8 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">
            <KhadimLogo />
          </div>
          <span className="font-semibold text-gb-text text-lg tracking-tight">Khadim</span>
        </div>
      </div>
      
      {/* Spacer for potential future right-side action button, also helps balance layout if we drop absolute positioning */}
      <div className="w-10" />
    </div>
  );
}
