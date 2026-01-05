import React from "react";

interface ChatHeaderProps {
  onOpenSidebar: () => void;
}

export function ChatHeader({ onOpenSidebar }: ChatHeaderProps) {
  return (
    <div className="md:hidden flex items-center p-4 border-b border-gb-border bg-gb-bg sticky top-0 z-10">
      <button
        onClick={onOpenSidebar}
        className="p-2 -ml-2 rounded-lg text-gb-text-secondary hover:bg-gb-bg-subtle"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span className="ml-3 font-semibold text-gb-text">Khadim</span>
    </div>
  );
}
