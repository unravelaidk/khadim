import type { Dispatch, SetStateAction } from "react";
import { Input } from "../ui/input";
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
  setFilterType
}: LibraryToolbarProps) {
  return (
    <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
      {/* Left: Filters */}
      <div className="flex items-center gap-2 w-full xl:w-auto">
        <div className="w-40">
          <Select value={filterType} onValueChange={setFilterType}>
             <SelectTrigger className="h-10 bg-white border-gb-border shadow-sm text-gb-text">
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
          className={`h-10 px-4 rounded-md border flex items-center gap-2 text-sm font-medium transition-all shadow-sm ${
            showFavorites
              ? "bg-white border-gb-accent text-gb-accent shadow-gb-sm"
              : "bg-white border-gb-border text-gb-text-secondary hover:text-gb-text hover:border-gray-300"
          }`}
        >
          {showFavorites ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          )}
          My favorites
        </button>
      </div>

      <div className="flex items-center gap-3 w-full xl:w-auto">
        <div className="relative flex-1 xl:w-72">
          <div className="absolute left-3 top-2.5 text-gray-400">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <Input
            placeholder="Search Workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 bg-white border-gb-border shadow-sm text-gb-text placeholder:text-gray-400"
          />
        </div>

        <div className="flex bg-white border border-gb-border rounded-lg p-1 h-10 shrink-0 shadow-sm">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 px-2 rounded-md transition-all flex items-center justify-center ${
              viewMode === "grid"
                ? "bg-gb-bg-subtle text-gb-text shadow-sm border border-gray-200"
                : "text-gb-text-muted hover:text-gb-text hover:bg-gray-50"
            }`}
            title="Grid View"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 px-2 rounded-md transition-all flex items-center justify-center ${
              viewMode === "list"
                ? "bg-gb-bg-subtle text-gb-text shadow-sm border border-gray-200"
                : "text-gb-text-muted hover:text-gb-text hover:bg-gray-50"
            }`}
            title="List View"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
