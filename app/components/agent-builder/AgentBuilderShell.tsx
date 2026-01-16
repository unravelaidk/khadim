import type { ReactNode } from "react";

interface AgentBuilderShellProps {
  sidebar: ReactNode;
  header: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
}

export function AgentBuilderShell({ sidebar, header, content, footer }: AgentBuilderShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      {sidebar}
      <div className="flex-1 flex flex-col bg-gb-bg overflow-hidden relative">
        {header}
        {content}
        {footer}
      </div>
    </div>
  );
}
