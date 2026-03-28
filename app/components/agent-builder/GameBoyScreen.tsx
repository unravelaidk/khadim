import type { ReactNode } from "react";

interface ChatContainerProps {
  children: ReactNode;
}

export function GameBoyScreen({ children }: ChatContainerProps) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-gb-border/60 bg-gb-bg-card shadow-gb-md">
      <div className="min-h-[360px] p-5 md:p-7">
        {children}
      </div>
    </div>
  );
}
