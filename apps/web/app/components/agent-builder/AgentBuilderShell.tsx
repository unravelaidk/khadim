import type { ReactNode } from "react";

interface AgentBuilderShellProps {
  sidebar: ReactNode;
  header: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
}

export function AgentBuilderShell({ sidebar, header, content, footer }: AgentBuilderShellProps) {
  return (
    <div className="khadim-web-shell h-dvh max-h-dvh overflow-hidden">
      <div className="khadim-web-header">{header}</div>
      <div className="khadim-web-sidebar">{sidebar}</div>
      <div className="khadim-web-workspace relative flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {content}
        </div>
        {footer}
      </div>
    </div>
  );
}
