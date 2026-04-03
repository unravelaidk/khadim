import type { ReactNode } from "react";

interface AgentBuilderShellProps {
  sidebar: ReactNode;
  header: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
}

export function AgentBuilderShell({ sidebar, header, content, footer }: AgentBuilderShellProps) {
  return (
    <div className="glass-page-shell flex h-dvh max-h-dvh overflow-hidden">
      {sidebar}
      <div className="relative z-10 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
        {header}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {content}
        </div>
        {footer}
      </div>
    </div>
  );
}
