import { useState } from "react";
import { ScrollArea } from "../ui/scroll-area";
import type { Workspace } from "../workspace/workspace-types";
import { FileExplorerHeader } from "./FileExplorer/FileExplorerHeader";
import { FilePreviewCard } from "./FileExplorer/FilePreviewCard";
import { LuFile, LuFolder, LuGrid3X3, LuList, LuSearch } from "react-icons/lu";

interface LibraryFileExplorerProps {
  workspace: Workspace;
  onBack: () => void;
  onLoad: () => void;
}

export function LibraryFileExplorer({ workspace, onBack, onLoad }: LibraryFileExplorerProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredFiles = searchQuery
    ? workspace.files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : workspace.files;

  return (
    <div className="flex-1 h-full p-6 md:p-8 overflow-hidden flex flex-col">
      <FileExplorerHeader 
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        onBack={onBack}
        onLoad={onLoad}
      />

      {/* Finder-style panel */}
      <div className="flex-1 rounded-2xl glass-panel-strong flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-border)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <LuFolder className="w-4 h-4 text-[var(--text-muted)]" />
            <span className="text-sm font-medium text-[var(--text-primary)]">Project Files</span>
            <span className="text-xs text-[var(--text-muted)] tabular-nums">({filteredFiles.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <LuSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search files"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input h-8 w-40 rounded-lg pl-8 pr-3 text-xs"
              />
            </div>
            <div className="flex rounded-lg border border-[var(--glass-border)] overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                title="Grid view"
              >
                <LuGrid3X3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                title="List view"
              >
                <LuList className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          {filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)]">
              {searchQuery ? (
                <>
                  <LuSearch className="w-8 h-8 mb-3 opacity-30" />
                  <p className="text-sm">No files matching "{searchQuery}"</p>
                </>
              ) : (
                <>
                  <LuFolder className="w-10 h-10 mb-3 opacity-20" />
                  <p className="text-sm font-medium">Empty directory</p>
                  <p className="text-xs mt-1 opacity-60">No files in this workspace yet</p>
                </>
              )}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
              {filteredFiles.map((file) => (
                <FilePreviewCard key={file.id} file={file} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-[var(--glass-border)]">
              {/* Column headers */}
              <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)] select-none bg-[var(--glass-bg)]">
                <span className="flex-1 min-w-0">Name</span>
                <span className="w-24 text-right hidden sm:block">Modified</span>
                <span className="w-20 text-right hidden md:block">Size</span>
              </div>
              {filteredFiles.map((file) => (
                <button
                  key={file.id}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg-strong)]"
                >
                  {file.type === "folder" ? (
                    <LuFolder className="w-[18px] h-[18px] text-[#5BA0D0] shrink-0" />
                  ) : (
                    <LuFile className="w-[18px] h-[18px] text-[var(--text-muted)] shrink-0" />
                  )}
                  <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-[var(--text-primary)]">{file.name}</span>
                  <span className="w-24 text-right text-[12px] text-[var(--text-muted)] tabular-nums hidden sm:block shrink-0">
                    {file.modifiedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="w-20 text-right text-[12px] text-[var(--text-muted)] tabular-nums hidden md:block shrink-0">
                    {file.type === "folder" ? "—" : file.size ? formatFileSizeLocal(file.size) : "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

function formatFileSizeLocal(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
