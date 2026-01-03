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
    <div className="flex-1 h-full bg-gb-bg-subtle/50 p-8 overflow-hidden flex flex-col">
      <header className="mb-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="mt-1 font-sans text-gb-text-muted text-sm px-1">
              Manage and access your archived project workspaces.
            </p>
          </div>
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
        <div className={`pb-20 pt-10 ${
          viewMode === "grid" 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8" 
            : "flex flex-col gap-2"
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
          
          {/* Empty State / Slots */}
          {filteredWorkspaces.length === 0 && (
             <div className="col-span-full flex flex-col items-center justify-center py-20 text-gb-text-muted opacity-50">
               <span className="text-4xl mb-4">🔍</span>
               <p>No workspaces found matching filters</p>
             </div>
          )}

          {/* Aesthetic Empty Slots - Only in Grid View and Clean State */}
          {viewMode === "grid" && searchQuery === "" && !showFavorites && Array.from({ length: Math.max(0, 8 - filteredWorkspaces.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="border border-gb-border border-dashed rounded-xl h-40 flex items-center justify-center opacity-30"
            >
              <span className="font-sans text-gb-text-muted text-xs font-medium">
                [EMPTY SLOT]
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
