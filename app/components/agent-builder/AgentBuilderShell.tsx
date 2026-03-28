import type { ReactNode } from "react";

interface AgentBuilderShellProps {
  sidebar: ReactNode;
  header: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
}

export function AgentBuilderShell({ sidebar, header, content, footer }: AgentBuilderShellProps) {
  return (
    <div className="gb-page-shell flex h-screen overflow-hidden">
      {sidebar}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden bg-transparent min-w-0">
        {header}
        {content}
        {footer}
      </div>
    </div>
  );
}