import type { ReactNode } from "react";

interface ChatContainerProps {
  children: ReactNode;
}

export function GameBoyScreen({ children }: ChatContainerProps) {
  return (
    <div className="rounded-2xl overflow-hidden bg-gb-bg-card border border-gb-border shadow-gb-md">
      <div className="p-6 min-h-[320px]">
        {children}
      </div>
    </div>
  );
}
