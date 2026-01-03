interface FileExplorerHeaderProps {
  workspaceName: string;
  workspaceId: string;
  onBack: () => void;
  onLoad: () => void;
}

export function FileExplorerHeader({ workspaceName, workspaceId, onBack, onLoad }: FileExplorerHeaderProps) {
  return (
    <header className="mb-6 flex items-center justify-between pb-4">
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-xl bg-gb-bg-card border border-gb-border flex items-center justify-center hover:bg-white hover:shadow-gb-sm transition-all text-gb-text-secondary"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-sans font-semibold text-gb-text flex items-center gap-3">
            <span className="text-2xl opacity-80">💾</span>
            {workspaceName}
          </h1>
          <p className="font-sans text-gb-text-muted text-xs mt-0.5">
            Workspace ID: {workspaceId}
          </p>
        </div>
      </div>
      
      <button
        onClick={onLoad}
        className="bg-gb-text text-gb-text-inverse px-5 py-2.5 rounded-xl font-sans font-medium hover:opacity-90 transition-opacity flex items-center gap-2 shadow-gb-sm hover:shadow-gb-md"
      >
        <span>Open Workspace</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    </header>
  );
}
