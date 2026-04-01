import { LuArrowLeft, LuExternalLink, LuFolder } from "react-icons/lu";

interface FileExplorerHeaderProps {
  workspaceName: string;
  workspaceId: string;
  onBack: () => void;
  onLoad: () => void;
}

export function FileExplorerHeader({ workspaceName, workspaceId, onBack, onLoad }: FileExplorerHeaderProps) {
  return (
    <header className="mb-5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button 
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-xl btn-glass transition-all hover:shadow-[var(--shadow-glass-sm)]"
          title="Back to library"
        >
          <LuArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-9 h-9 rounded-xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] flex items-center justify-center">
          <LuFolder className="w-5 h-5 text-[#5BA0D0]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            {workspaceName}
          </h1>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            {workspaceId}
          </p>
        </div>
      </div>
      
      <button
        onClick={onLoad}
        className="btn-ink rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-2"
      >
        <span>Open Workspace</span>
        <LuExternalLink className="w-3.5 h-3.5" />
      </button>
    </header>
  );
}
