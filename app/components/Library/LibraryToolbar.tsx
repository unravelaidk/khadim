import { LuGrid3X3, LuList, LuSearch, LuStar } from "react-icons/lu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export type SortOption = "date" | "name" | "files";
export type ViewMode = "grid" | "list";

interface LibraryToolbarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showFavorites: boolean;
  setShowFavorites: (show: boolean) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  filterType: string;
  setFilterType: (type: string) => void;
}

export function LibraryToolbar({
  searchQuery,
  setSearchQuery,
  showFavorites,
  setShowFavorites,
  viewMode,
  setViewMode,
  filterType,
  setFilterType,
}: LibraryToolbarProps) {
  return (
    <div className="flex flex-col xl:flex-row gap-3 justify-between items-start xl:items-center">
      {/* Left: Filters */}
      <div className="flex items-center gap-2 w-full xl:w-auto">
        <div className="w-36">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 glass-input rounded-lg text-sm">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <button
          onClick={() => setShowFavorites(!showFavorites)}
          className={`h-9 px-3.5 rounded-lg border flex items-center gap-2 text-sm font-medium transition-all ${
            showFavorites
              ? "bg-amber-50 border-amber-300 text-amber-700 shadow-sm dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400"
              : "btn-glass"
          }`}
        >
          <LuStar className={`w-4 h-4 ${showFavorites ? "fill-current" : ""}`} />
          <span className="hidden sm:inline">Favorites</span>
        </button>
      </div>

      {/* Right: Search + View toggle */}
      <div className="flex items-center gap-2 w-full xl:w-auto">
        <div className="relative flex-1 xl:w-64">
          <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            placeholder="Search workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input w-full h-9 rounded-lg pl-10 pr-3 text-sm"
          />
        </div>

        <div className="flex rounded-lg border border-[var(--glass-border)] overflow-hidden shrink-0">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 transition-colors ${
              viewMode === "grid"
                ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
            title="Grid View"
          >
            <LuGrid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 transition-colors ${
              viewMode === "list"
                ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
            title="List View"
          >
            <LuList className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
