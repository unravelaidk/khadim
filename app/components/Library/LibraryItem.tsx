import { formatRetroDate } from "../workspace/workspace-types";
import type { Workspace } from "../workspace/workspace-types";
import { countFiles } from "../workspace/workspace-types";
import { DropdownRoot, DropdownTrigger, DropdownContent, DropdownItem } from "../ui/dropdown-menu";

interface LibraryItemProps {
  workspace: Workspace;
  onClick: () => void;
  viewMode?: "grid" | "list";
  onToggleFavorite?: () => void;
}

export function LibraryItem({ workspace, onClick, viewMode = "grid", onToggleFavorite }: LibraryItemProps) {
  const fileCount = countFiles(workspace.files);

  const MenuOverlay = () => (
    <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
      <DropdownRoot>
        <DropdownTrigger className="p-1.5 rounded-md hover:bg-gb-bg-subtle/80 text-gb-text-muted hover:text-gb-text transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/></svg>
        </DropdownTrigger>
        <DropdownContent align="end">
            <DropdownItem onClick={onToggleFavorite}>
                <span className="flex items-center gap-2">
                    {workspace.isFavorite ? (
                         <>
                            <svg width="14" height="14" className="text-yellow-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            Unfavorite
                         </>
                    ) : (
                         <>
                            <svg width="14" height="14" className="text-yellow-500" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                            Add to Favorites
                         </>
                    )}
                </span>
            </DropdownItem>
            <DropdownItem className="text-red-600 hover:text-red-700">Delete</DropdownItem>
        </DropdownContent>
      </DropdownRoot>
    </div>
  );

  if (viewMode === "list") {
    return (
      <div className="relative group/item">
          <button
            onClick={onClick}
            className="group flex items-center gap-4 p-3 w-full bg-gb-bg-card border border-gb-border rounded-lg shadow-sm hover:shadow-md hover:bg-white transition-all duration-200"
          >
            <div className="w-10 h-10 rounded-lg bg-gb-bg-subtle flex items-center justify-center text-xl shrink-0">
              💾
            </div>
            
            <div className="flex-1 text-left">
              <h3 className="font-sans font-semibold text-sm text-gb-text transition-colors">
                {workspace.name}
              </h3>
              <p className="text-[10px] text-gb-text-muted font-mono mt-0.5">
                ID: {workspace.id}
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs text-gb-text-secondary mr-8">
              {workspace.isFavorite && (
                <span className="text-yellow-500" title="Favorite">★</span>
              )}
              <span className="font-mono">{fileCount} files</span>
              <span className="tabular-nums">{formatRetroDate(workspace.createdAt)}</span>
            </div>
          </button>
          
          <div className="absolute top-1/2 -translate-y-1/2 right-3">
             {/* Reusing menu trigger logic usually, but here just inline for list pos */}
              <DropdownRoot>
                <DropdownTrigger className="p-1.5 rounded-md hover:bg-gb-bg-subtle text-gb-text-muted hover:text-gb-text transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </DropdownTrigger>
                <DropdownContent align="end">
                    <DropdownItem onClick={onToggleFavorite}>
                        <span className="flex items-center gap-2">
                             {workspace.isFavorite ? 'Unfavorite' : 'Add to Favorites'}
                        </span>
                    </DropdownItem>
                    <DropdownItem className="text-red-600">Delete</DropdownItem>
                </DropdownContent>
              </DropdownRoot>
          </div>
      </div>
    );
  }

  return (
    <div className="relative group/card">
        <MenuOverlay />
        <button
          onClick={onClick}
          className="w-full group relative flex flex-col items-start p-5 bg-gb-bg-card border border-gb-border rounded-xl shadow-gb-sm hover:shadow-gb-md hover:-translate-y-0.5 transition-all duration-200 text-left"
        >
          {/* Tape Label Effect */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-28 h-5 bg-yellow-50 border border-gb-border-medium/60 rounded-full shadow-sm flex items-center justify-center z-10">
            <span className="text-[9px] font-sans font-medium text-gb-text-secondary uppercase tracking-widest">
              DATA CASSETTE
            </span>
          </div>

          <div className="mt-2 w-full">
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 rounded-lg bg-gb-bg-subtle flex items-center justify-center text-lg">
                 💾
              </div>
              <div className="flex items-center gap-2 pr-6">
                {workspace.isFavorite && (
                  <span className="text-yellow-400 text-xs">★</span>
                )}
                <span className="font-sans text-[10px] font-medium text-gb-text-muted">
                  {formatRetroDate(workspace.createdAt)}
                </span>
              </div>
            </div>
            
            <h3 className="font-sans font-semibold text-base text-gb-text mb-1 line-clamp-1 w-full transition-colors">
              {workspace.name}
            </h3>
            
            <div className="flex items-center gap-2 mt-3">
              <span className="px-2 py-0.5 bg-gb-bg-subtle border border-gb-border-medium/30 rounded-md text-gb-text-secondary text-[10px] font-medium font-mono">
                {fileCount} FILES
              </span>
              <span className="px-2 py-0.5 rounded-md text-gb-text-muted text-[10px] uppercase font-mono tracking-tight">
                ID: {workspace.id.slice(0, 6)}
              </span>
            </div>
          </div>
        </button>
    </div>
  );
}
