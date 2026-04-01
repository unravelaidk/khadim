import type { Workspace } from "../workspace/workspace-types";
import { countFiles } from "../workspace/workspace-types";
import { DropdownRoot, DropdownTrigger, DropdownContent, DropdownItem } from "../ui/dropdown-menu";
import { LuFolder, LuMoreVertical, LuStar, LuTrash2, LuClock } from "react-icons/lu";

interface LibraryItemProps {
  workspace: Workspace;
  onClick: () => void;
  viewMode?: "grid" | "list";
  onToggleFavorite?: () => void;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 1) return "Today";
  if (diffDays < 2) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function LibraryItem({ workspace, onClick, viewMode = "grid", onToggleFavorite }: LibraryItemProps) {
  const fileCount = countFiles(workspace.files);

  const ContextMenu = ({ align = "end" as const }) => (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownRoot>
        <DropdownTrigger className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors">
          <LuMoreVertical className="w-4 h-4" />
        </DropdownTrigger>
        <DropdownContent align={align}>
          <DropdownItem onClick={onToggleFavorite}>
            <span className="flex items-center gap-2">
              <LuStar className={`w-3.5 h-3.5 ${workspace.isFavorite ? "text-amber-500 fill-amber-500" : ""}`} />
              {workspace.isFavorite ? "Remove favorite" : "Add to favorites"}
            </span>
          </DropdownItem>
          <DropdownItem className="text-red-500 hover:text-red-600">
            <span className="flex items-center gap-2">
              <LuTrash2 className="w-3.5 h-3.5" />
              Delete
            </span>
          </DropdownItem>
        </DropdownContent>
      </DropdownRoot>
    </div>
  );

  if (viewMode === "list") {
    return (
      <div className="group relative flex items-center">
        <button
          onClick={onClick}
          className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-[var(--glass-bg-strong)]"
        >
          <div className="w-9 h-9 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center shrink-0">
            <LuFolder className="w-4 h-4 text-[#5BA0D0]" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">{workspace.name}</h3>
              {workspace.isFavorite && <LuStar className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">{fileCount} files</p>
          </div>
          <span className="text-[12px] text-[var(--text-muted)] tabular-nums mr-8 hidden sm:block">
            {formatRelativeDate(workspace.createdAt)}
          </span>
        </button>
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <ContextMenu />
        </div>
      </div>
    );
  }

  return (
    <div className="group relative">
      <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <ContextMenu />
      </div>
      <button
        onClick={onClick}
        className="w-full glass-card rounded-2xl p-5 text-left"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] flex items-center justify-center">
            <LuFolder className="w-5 h-5 text-[#5BA0D0]" />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            {workspace.isFavorite && <LuStar className="w-3 h-3 text-amber-400 fill-amber-400" />}
            <LuClock className="w-3 h-3" />
            <span>{formatRelativeDate(workspace.createdAt)}</span>
          </div>
        </div>

        <h3 className="text-base font-semibold text-[var(--text-primary)] leading-snug line-clamp-2 mb-3">
          {workspace.name}
        </h3>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-muted)] text-[10px] font-medium tabular-nums">
            {fileCount} file{fileCount !== 1 ? "s" : ""}
          </span>
        </div>
      </button>
    </div>
  );
}
