import { useState, useMemo } from "react";
import { ScrollArea } from "../ui/scroll-area";
import type { Workspace } from "../workspace/workspace-types";
import { LibraryItem } from "./LibraryItem";
import { LibraryFileExplorer } from "./LibraryFileExplorer";
import { LibraryToolbar, type SortOption, type ViewMode } from "./LibraryToolbar";

interface LibraryViewProps {
  workspaces: Workspace[];
  onSelectWorkspace: (id: string) => void;
}

export function LibraryView({ workspaces: initialWorkspaces, onSelectWorkspace }: LibraryViewProps) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [viewingWorkspaceId, setViewingWorkspaceId] = useState<string | null>(null);
  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [showFavorites, setShowFavorites] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filterType, setFilterType] = useState<string>("all");

  const viewingWorkspace = workspaces.find((w) => w.id === viewingWorkspaceId);

  const handleToggleFavorite = (id: string) => {
    setWorkspaces(prev => prev.map(w => 
      w.id === id ? { ...w, isFavorite: !w.isFavorite } : w
    ));
  };

  const filteredWorkspaces = useMemo(() => {
    let result = workspaces;

    // Filter by Type (All vs Archived - Placeholder logic as we don't have archived prop yet)
    if (filterType === "archived") {
      // For now, let's just show empty or mock something if we had archived prop.
      // Since we don't have an 'archived' prop on Workspace, we'll just return empty to demonstrate it works,
      // or maybe filtered by some mock condition.
      // Let's assume no workspaces are archived for now unless we add that prop.
      result = []; 
    }

    // Filter by Favorites
    if (showFavorites) {
      result = result.filter((w) => w.isFavorite);
    }

    // Filter by Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((w) => 
        w.name.toLowerCase().includes(q) || 
        w.id.toLowerCase().includes(q)
      );
    }

    // Sort
    result = [...result].sort((a, b) => { // Create a copy to sort
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "files":
          return (b.files.length) - (a.files.length);
        case "date":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [workspaces, searchQuery, sortBy, showFavorites, filterType]);

  if (viewingWorkspace) {
    return (
      <LibraryFileExplorer
        workspace={viewingWorkspace}
        onBack={() => setViewingWorkspaceId(null)}
        onLoad={() => onSelectWorkspace(viewingWorkspace.id)}
      />
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden p-4 md:p-6 lg:p-8">
      <header className="mb-6 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)] font-semibold mb-2">Library</p>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] mb-1">Your workspaces</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Manage and access your project workspaces.
          </p>
        </div>

        <LibraryToolbar 
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          showFavorites={showFavorites}
          setShowFavorites={setShowFavorites}
          viewMode={viewMode}
          setViewMode={setViewMode}
          filterType={filterType}
          setFilterType={setFilterType}
        />
      </header>
      
      <ScrollArea className="flex-1 -mr-4 pr-4">
        <div className={`pb-20 pt-4 ${
          viewMode === "grid" 
            ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" 
            : "flex flex-col gap-0.5"
        }`}>
          {filteredWorkspaces.map((workspace) => (
            <LibraryItem
              key={workspace.id}
              workspace={workspace}
              onClick={() => setViewingWorkspaceId(workspace.id)}
              viewMode={viewMode}
              onToggleFavorite={() => handleToggleFavorite(workspace.id)}
            />
          ))}
          
          {filteredWorkspaces.length === 0 && (
             <div className="col-span-full flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
               <svg className="w-10 h-10 mb-3 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
               <p className="text-sm font-medium">No workspaces found</p>
               <p className="text-xs mt-1 opacity-60">Try adjusting your filters</p>
             </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
