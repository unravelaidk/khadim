import type { ReactNode } from "react";

interface ChatContainerProps {
  children: ReactNode;
}

export function GameBoyScreen({ children }: ChatContainerProps) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] glass-card-static shadow-[var(--shadow-glass-lg)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--glass-shine)] to-transparent" />
      <div className="p-3 sm:p-5 md:p-7">
        {children}
      </div>
    </div>
  );
}
