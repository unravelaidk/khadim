import KhadimLogo from "../../assets/Khadim-logo.svg";
import { LuMenu } from "react-icons/lu";

interface ChatHeaderProps {
  onOpenSidebar: () => void;
}

export function ChatHeader({ onOpenSidebar }: ChatHeaderProps) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between border-b-2 border-black bg-white px-4 py-3 transition-all duration-200 lg:hidden">
      <button
        onClick={onOpenSidebar}
        className="-ml-2 p-2 text-black/70 transition-colors duration-100 hover:bg-black hover:text-white"
        aria-label="Open Menu"
      >
        <LuMenu className="w-6 h-6" />
      </button>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <div className="w-8 h-8 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">
            <KhadimLogo />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-black">Khadim</span>
        </div>
      </div>
      
      <div className="w-10" />
    </div>
  );
}