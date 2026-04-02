import { useEffect, useState, useCallback, useMemo } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { agentProfiles, getAgentProfile } from "../../lib/agent-profiles";
import type { FileNode } from "../workspace/workspace-types";
import { FileEditorModal } from "./FileEditorModal";
import { showError, showSuccess } from "../../lib/toast";
import {
  LuChevronRight,
  LuChevronDown,
  LuFolder,
  LuFolderOpen,
  LuFileText,
  LuFileCode2,
  LuFileJson,
  LuFileImage,
  LuFileSpreadsheet,
  LuFile,
  LuGlobe,
  LuArrowLeft,
  LuPlus,
  LuMessageSquare,
  LuBot,
  LuClock,
  LuGrid3X3,
  LuList,
  LuSearch,
  LuBox,
  LuLayers,
  LuGitBranch,
  LuArrowUpRight,
  LuTerminal,
  LuZap,
  LuHash,
  LuExternalLink,
  LuPenLine,
  LuSparkles,
} from "react-icons/lu";

/* ── Types ─────────────────────────────────────────────────────────── */

interface WorkspaceSummary {
  id: string;
  name: string;
  agentId: string;
  sourceChatId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceChatSummary {
  id: string;
  title: string | null;
  updatedAt: string;
  isActive?: boolean;
  activeAgentId?: string | null;
}

interface WorkspaceFileSummary {
  id: string;
  path: string;
  content?: string;
  size: number | null;
  updatedAt: string;
}

interface WorkspaceDetailResponse {
  workspace: WorkspaceSummary;
  chats: WorkspaceChatSummary[];
  files: WorkspaceFileSummary[];
  activeChats: WorkspaceChatSummary[];
  activeAgents: Array<{ id: string; name: string; activeChatCount: number }>;
}

interface AgentHubPanelProps {
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string | null) => void;
  onSelectChat: (chatId: string | null) => void;
  onCreateWorkspace: () => Promise<void>;
  onCreateChatInWorkspace: () => Promise<void>;
}

/* ── File icon helper ──────────────────────────────────────────────── */

function getFileIcon(name: string, type: "file" | "folder", isOpen = false, size: "sm" | "md" | "lg" = "sm") {
  const sizeClass = size === "lg" ? "w-6 h-6" : size === "md" ? "w-5 h-5" : "w-[18px] h-[18px]";
  if (type === "folder") {
    return isOpen ? (
      <LuFolderOpen className={`${sizeClass} text-[#5BA0D0]`} />
    ) : (
      <LuFolder className={`${sizeClass} text-[#5BA0D0]`} />
    );
  }
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "py":
    case "css":
      return <LuFileCode2 className={`${sizeClass} text-[#8B9F78]`} />;
    case "html":
    case "htm":
      return <LuGlobe className={`${sizeClass} text-[#D08B5B]`} />;
    case "json":
      return <LuFileJson className={`${sizeClass} text-[#C4A35A]`} />;
    case "csv":
    case "xlsx":
    case "xls":
      return <LuFileSpreadsheet className={`${sizeClass} text-[#5BA070]`} />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
      return <LuFileImage className={`${sizeClass} text-[#B07DB0]`} />;
    case "md":
    case "txt":
      return <LuFileText className={`${sizeClass} text-[var(--text-muted)]`} />;
    default:
      return <LuFile className={`${sizeClass} text-[var(--text-muted)]`} />;
  }
}

function getFileKind(name: string, type: "file" | "folder"): string {
  if (type === "folder") return "Folder";
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts": return "TypeScript";
    case "tsx": return "TSX";
    case "js": return "JavaScript";
    case "jsx": return "JSX";
    case "py": return "Python";
    case "css": return "Stylesheet";
    case "html": case "htm": return "HTML";
    case "json": return "JSON";
    case "csv": return "CSV";
    case "md": return "Markdown";
    case "txt": return "Text";
    case "png": case "jpg": case "jpeg": case "gif": case "svg": case "webp": return "Image";
    default: return "Document";
  }
}

function getFileColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts": case "tsx": return "#3178c6";
    case "js": case "jsx": return "#f7df1e";
    case "py": return "#3776ab";
    case "css": return "#264de4";
    case "html": case "htm": return "#e34c26";
    case "json": return "#C4A35A";
    case "csv": case "xlsx": case "xls": return "#217346";
    case "png": case "jpg": case "jpeg": case "gif": case "svg": case "webp": return "#B07DB0";
    case "md": return "#083fa1";
    default: return "#697260";
  }
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateFull(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateCompact(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Main Component ────────────────────────────────────────────────── */

export function AgentHubPanel({
  selectedWorkspaceId,
  onSelectWorkspace,
  onSelectChat,
  onCreateWorkspace,
  onCreateChatInWorkspace,
}: AgentHubPanelProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [detail, setDetail] = useState<WorkspaceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileSummary | null>(null);
  const [fileViewMode, setFileViewMode] = useState<"list" | "grid">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailTab, setDetailTab] = useState<"files" | "threads">("files");

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function load(showLoading = true) {
      if (showLoading) setLoading(true);
      try {
        if (selectedWorkspaceId) {
          const response = await fetch(`/api/workspaces/${selectedWorkspaceId}`);
          if (!response.ok) return;
          const data = await response.json();
          if (!cancelled) setDetail(data);
        } else {
          const response = await fetch("/api/workspaces");
          if (!response.ok) return;
          const data = await response.json();
          if (!cancelled) {
            setWorkspaces(data.workspaces ?? []);
            setDetail(null);
          }
        }
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    }

    void load();
    intervalId = setInterval(() => void load(false), 5000);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [selectedWorkspaceId]);

  const handleOpenFile = async (fileId: string) => {
    const file = await fetchWorkspaceFile(fileId);
    if (!file) { showError("Failed to open file."); return; }
    setSelectedFile(file);
  };

  const handleSaveFile = async (content: string) => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append("content", content);
    const response = await fetch(`/api/workspace-files/${selectedFile.id}`, { method: "PATCH", body: formData });
    if (!response.ok) { showError("Failed to save file."); return; }
    const data = await response.json();
    const updatedFile = data.file as WorkspaceFileSummary;
    setSelectedFile(updatedFile);
    setDetail((prev) =>
      prev ? { ...prev, files: prev.files.map((f) => (f.id === updatedFile.id ? updatedFile : f)) } : prev
    );
    showSuccess("File saved.");
  };

  /* ── Workspace Detail View ─────────────────────────────────────── */

  if (selectedWorkspaceId && detail) {
    const agent = getAgentProfile(detail.workspace.agentId);
    const fileTree = buildFileTree(detail.files);
    const filteredFiles = searchQuery
      ? detail.files.filter((f) => f.path.toLowerCase().includes(searchQuery.toLowerCase()))
      : null;
    const displayTree = filteredFiles ? buildFileTree(filteredFiles) : fileTree;
    const totalSize = detail.files.reduce((s, f) => s + (f.size ?? 0), 0);
    const hasActivity = detail.activeAgents.length > 0 || detail.activeChats.length > 0;

    // File type breakdown for the mini-chart
    const fileExtensions = detail.files.reduce((acc, f) => {
      const ext = f.path.split(".").pop()?.toLowerCase() || "other";
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedExtensions = Object.entries(fileExtensions)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden animate-in fade-in duration-300">
        <ScrollArea className="flex-1">
          <div className="mx-auto w-full max-w-6xl overflow-x-hidden px-3 pb-20 pt-4 sm:px-4 md:px-6 lg:px-8 sm:pt-5">

            {/* ── Navigation + Title ── */}
            <div className="mb-6">
              <button
                onClick={() => onSelectWorkspace(null)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-4 group"
              >
                <LuArrowLeft className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" />
                All workspaces
              </button>

              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 sm:gap-3 mb-2 flex-wrap">
                    <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[var(--color-accent)] text-[var(--color-accent-ink)] shadow-[var(--shadow-glow-sm)] shrink-0">
                      <LuBox className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[var(--text-primary)] truncate font-display lg:text-2xl">
                        {detail.workspace.name}
                      </h1>
                    </div>
                    {hasActivity && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:pl-[52px] sm:text-xs text-[var(--text-muted)] flex-wrap">
                    {agent && (
                      <span className="inline-flex items-center gap-1">
                        <LuBot className="w-3 h-3 opacity-60" />
                        {agent.name}
                      </span>
                    )}
                    <span className="hidden sm:block h-1 w-1 rounded-full bg-[var(--text-muted)] opacity-30" />
                    <span className="hidden sm:inline">Created {formatDateCompact(detail.workspace.createdAt)}</span>
                    <span className="hidden sm:block h-1 w-1 rounded-full bg-[var(--text-muted)] opacity-30" />
                    <span>Updated {formatRelativeDate(detail.workspace.updatedAt)}</span>
                  </div>
                </div>

                <button
                  onClick={() => void onCreateChatInWorkspace()}
                  className="btn-ink inline-flex self-start rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold items-center gap-1.5 sm:gap-2 shrink-0"
                >
                  <LuPlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New thread</span>
                  <span className="sm:hidden">New</span>
                </button>
              </div>
            </div>

            {/* ── Stats Row ── */}
            <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
              <StatCard
                icon={<LuLayers className="w-4 h-4" />}
                label="Files"
                value={String(detail.files.length)}
                sub={formatFileSize(totalSize)}
              />
              <StatCard
                icon={<LuMessageSquare className="w-4 h-4" />}
                label="Threads"
                value={String(detail.chats.length)}
                sub={detail.activeChats.length > 0 ? `${detail.activeChats.length} active` : "none active"}
                accent={detail.activeChats.length > 0}
              />
              <StatCard
                icon={<LuClock className="w-4 h-4" />}
                label="Last active"
                value={formatRelativeDate(detail.workspace.updatedAt)}
                sub={formatDateCompact(detail.workspace.updatedAt)}
              />
            </div>

            {/* ── Active Agents Banner ── */}
            {detail.activeAgents.length > 0 && (
              <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 animate-in fade-in duration-500">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-500/15">
                    <LuZap className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {detail.activeAgents.map((a) => a.name).join(", ")} working
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {detail.activeAgents.reduce((s, a) => s + a.activeChatCount, 0)} active thread{detail.activeAgents.reduce((s, a) => s + a.activeChatCount, 0) !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </div>
            )}

            {/* ── Tab Switcher (mobile) ── */}
            <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-[var(--glass-border)] lg:hidden">
              <button
                onClick={() => setDetailTab("files")}
                className={`min-w-0 shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  detailTab === "files"
                    ? "border-[var(--text-primary)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Files ({detail.files.length})
              </button>
              <button
                onClick={() => setDetailTab("threads")}
                className={`min-w-0 shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  detailTab === "threads"
                    ? "border-[var(--text-primary)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Threads ({detail.chats.length})
              </button>
            </div>

            {/* ── Main Two-Column ── */}
            <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">

              {/* ── Left: Files ── */}
              <div className={`min-w-0 space-y-4 ${detailTab !== "files" ? "hidden lg:block" : ""}`}>
                {/* Files card */}
                <section className="rounded-2xl glass-panel-strong overflow-hidden">
                  {/* Toolbar */}
                  <div className="flex flex-col gap-3 border-b border-[var(--glass-border)] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex items-center gap-2.5">
                      <LuFolder className="w-4 h-4 text-[var(--text-muted)]" />
                      <span className="text-sm font-semibold text-[var(--text-primary)]">Files</span>
                      <span className="rounded-md bg-[var(--glass-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)] tabular-nums border border-[var(--glass-border)]">
                        {detail.files.length}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="relative min-w-0 flex-1 sm:flex-none">
                        <LuSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                        <input
                          type="text"
                          placeholder="Filter…"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="glass-input h-8 w-full sm:w-40 rounded-lg pl-8 pr-3 text-xs"
                        />
                      </div>
                      <div className="flex rounded-lg border border-[var(--glass-border)] overflow-hidden">
                        <button
                          onClick={() => setFileViewMode("list")}
                          className={`p-1.5 transition-colors ${fileViewMode === "list" ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                        >
                          <LuList className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setFileViewMode("grid")}
                          className={`p-1.5 transition-colors ${fileViewMode === "grid" ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                        >
                          <LuGrid3X3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Column headers (list) */}
                  {fileViewMode === "list" && displayTree.length > 0 && (
                    <div className="flex items-center gap-2 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] bg-opacity-30 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)] select-none sm:px-5">
                      <span className="flex-1 min-w-0">Name</span>
                      <span className="w-28 text-right hidden sm:block">Modified</span>
                      <span className="w-20 text-right hidden md:block">Size</span>
                      <span className="w-20 text-right hidden lg:block">Kind</span>
                    </div>
                  )}

                  {/* File content */}
                  {displayTree.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-6">
                      {searchQuery ? (
                        <div className="text-center">
                          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                            <LuSearch className="w-5 h-5 text-[var(--text-muted)] opacity-50" />
                          </div>
                          <p className="text-sm font-medium text-[var(--text-secondary)]">No files match "{searchQuery}"</p>
                          <button onClick={() => setSearchQuery("")} className="mt-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline">Clear filter</button>
                        </div>
                      ) : (
                        <div className="text-center max-w-xs">
                          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--glass-bg)] border border-dashed border-[var(--glass-border-strong)]">
                            <LuTerminal className="w-6 h-6 text-[var(--text-muted)] opacity-40" />
                          </div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">No files yet</p>
                          <p className="mt-1.5 text-xs text-[var(--text-muted)] leading-relaxed">
                            Start a thread and files generated during conversation appear here automatically.
                          </p>
                          <button
                            onClick={() => void onCreateChatInWorkspace()}
                            className="mt-4 inline-flex items-center gap-1.5 rounded-xl btn-glass px-3.5 py-2 text-xs font-medium"
                          >
                            <LuPlus className="w-3 h-3" />
                            Start a thread
                          </button>
                        </div>
                      )}
                    </div>
                  ) : fileViewMode === "list" ? (
                    <div className="py-0.5">
                      {displayTree.map((node) => (
                        <FinderListRow key={node.id} node={node} depth={0} onOpenFile={handleOpenFile} />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
                      {displayTree.map((node) => (
                        <FinderGridItem key={node.id} node={node} onOpenFile={handleOpenFile} />
                      ))}
                    </div>
                  )}
                </section>

                {/* File type breakdown (when files exist) */}
                {sortedExtensions.length > 0 && (
                  <section className="rounded-2xl glass-card-static p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">Composition</p>
                    <div className="flex items-center gap-1 h-2 rounded-full overflow-hidden bg-[var(--glass-bg)] mb-3">
                      {sortedExtensions.map(([ext, count]) => (
                        <div
                          key={ext}
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(count / detail.files.length) * 100}%`,
                            backgroundColor: getFileColor(`.${ext}`),
                            minWidth: "4px",
                            opacity: 0.7,
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {sortedExtensions.map(([ext, count]) => (
                        <div key={ext} className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getFileColor(`.${ext}`), opacity: 0.7 }} />
                          <span className="font-mono">.{ext}</span>
                          <span className="tabular-nums opacity-60">{count}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {/* ── Right: Threads & Info ── */}
              <div className={`min-w-0 space-y-4 ${detailTab !== "threads" ? "hidden lg:block" : ""}`}>
                {/* Threads */}
                <section className="rounded-2xl glass-panel-strong overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-4 py-2.5 sm:px-5">
                    <div className="flex items-center gap-2.5">
                      <LuMessageSquare className="w-4 h-4 text-[var(--text-muted)]" />
                      <span className="text-sm font-semibold text-[var(--text-primary)]">Threads</span>
                      <span className="rounded-md bg-[var(--glass-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)] tabular-nums border border-[var(--glass-border)]">
                        {detail.chats.length}
                      </span>
                    </div>
                    <button
                      onClick={() => void onCreateChatInWorkspace()}
                      className="flex items-center justify-center w-7 h-7 rounded-lg btn-glass transition-all"
                      title="New thread"
                    >
                      <LuPlus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {detail.chats.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--glass-bg)] border border-dashed border-[var(--glass-border-strong)]">
                        <LuPenLine className="w-5 h-5 text-[var(--text-muted)] opacity-40" />
                      </div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">No threads yet</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">Threads scope conversations to this workspace</p>
                      <button
                        onClick={() => void onCreateChatInWorkspace()}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-xl btn-glass px-3 py-1.5 text-xs font-medium"
                      >
                        <LuPlus className="w-3 h-3" />
                        Start a thread
                      </button>
                    </div>
                  ) : (
                    <div className="py-1">
                      {detail.chats.map((chat) => {
                        const chatAgent = chat.activeAgentId ? getAgentProfile(chat.activeAgentId) : null;
                        return (
                          <button
                            key={chat.id}
                            onClick={() => onSelectChat(chat.id)}
                            className="flex w-full items-start gap-3 px-4 py-3 text-left transition-all hover:bg-[var(--glass-bg-strong)] group sm:px-5"
                          >
                            <div className="relative mt-0.5 shrink-0">
                              <div className={`flex items-center justify-center w-8 h-8 rounded-xl border ${
                                chat.isActive
                                  ? "bg-emerald-500/10 border-emerald-500/20"
                                  : "bg-[var(--glass-bg)] border-[var(--glass-border)]"
                              }`}>
                                <LuHash className={`w-3.5 h-3.5 ${chat.isActive ? "text-emerald-500" : "text-[var(--text-muted)]"}`} />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate leading-snug group-hover:text-[var(--text-primary)]">
                                {chat.title || "Untitled thread"}
                              </p>
                              <p className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
                                {chat.isActive ? (
                                  <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                      {chatAgent ? `${chatAgent.name} working…` : "Active"}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <LuClock className="w-3 h-3 opacity-50" />
                                    {formatRelativeDate(chat.updatedAt)}
                                  </>
                                )}
                              </p>
                            </div>
                            <LuArrowUpRight className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-60 transition-opacity mt-1.5 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Workspace details card */}
                <section className="rounded-2xl glass-card-static p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">Workspace details</p>
                  <div className="space-y-3">
                    <DetailRow label="Created" value={formatDateFull(detail.workspace.createdAt)} />
                    <DetailRow label="Last updated" value={formatDateFull(detail.workspace.updatedAt)} />
                    <DetailRow label="Total size" value={formatFileSize(totalSize)} />
                    {agent && <DetailRow label="Default agent" value={agent.name} />}
                    <DetailRow label="Workspace ID" value={detail.workspace.id} mono />
                  </div>
                </section>

                {/* Quick tips card (shown when workspace has few items) */}
                {detail.files.length <= 2 && detail.chats.length <= 2 && (
                  <section className="rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <LuSparkles className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Tips</p>
                    </div>
                    <div className="space-y-2.5">
                      {[
                        { text: "Start a new thread to generate more files in this workspace context." },
                        { text: "All threads in a workspace share the same files and history." },
                        { text: "Click any file to view or edit it directly." },
                      ].map((tip, i) => (
                        <p key={i} className="text-[11px] text-[var(--text-muted)] leading-relaxed flex items-start gap-2">
                          <span className="mt-1 w-1 h-1 rounded-full bg-[var(--text-muted)] opacity-40 shrink-0" />
                          {tip.text}
                        </p>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        {selectedFile && (
          <FileEditorModal
            isOpen={Boolean(selectedFile)}
            onClose={() => setSelectedFile(null)}
            filename={selectedFile.path}
            content={selectedFile.content || ""}
            editable={isCodeFile(selectedFile.path)}
            onSave={isCodeFile(selectedFile.path) ? handleSaveFile : undefined}
          />
        )}
      </div>
    );
  }

  /* ── Workspaces List View ────────────────────────────────────────── */

  const activeWorkspaces = workspaces.filter((w) => {
    const diffMs = new Date().getTime() - new Date(w.updatedAt).getTime();
    return diffMs < 86400000;
  });
  const olderWorkspaces = workspaces.filter((w) => {
    const diffMs = new Date().getTime() - new Date(w.updatedAt).getTime();
    return diffMs >= 86400000;
  });

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden animate-in fade-in duration-500">
      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-6 md:px-6 lg:px-8 lg:pt-10">

          {/* ── Hero ── */}
          <header className="mb-10">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full glass-panel px-3 py-1">
                  <LuBox className="w-3.5 h-3.5 text-[var(--text-primary)]" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Workspaces</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl font-display">
                  Persistent context<br className="hidden sm:block" /> for deep work.
                </h1>
                <p className="max-w-lg text-sm text-[var(--text-secondary)] leading-relaxed">
                  Workspaces collect files, code, and chat threads into a single shared context. Start one from any conversation, or create a blank one here.
                </p>
              </div>
              <button
                onClick={() => void onCreateWorkspace()}
                className="btn-ink rounded-xl px-5 py-2.5 text-sm font-semibold flex items-center gap-2 shrink-0 self-start sm:self-auto"
              >
                <LuPlus className="w-4 h-4" />
                New workspace
              </button>
            </div>
          </header>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-[var(--text-primary)] border-t-transparent animate-spin" />
                <span className="text-xs text-[var(--text-muted)]">Loading workspaces…</span>
              </div>
            </div>
          ) : workspaces.length === 0 ? (
            /* ── Empty State ── */
            <div className="relative rounded-3xl border border-dashed border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-8 sm:p-12 text-center overflow-hidden">
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
                backgroundImage: `repeating-linear-gradient(
                  0deg, transparent, transparent 31px, var(--text-primary) 31px, var(--text-primary) 32px
                ), repeating-linear-gradient(
                  90deg, transparent, transparent 31px, var(--text-primary) 31px, var(--text-primary) 32px
                )`
              }} />

              <div className="relative z-10">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] shadow-[var(--shadow-glass-sm)]">
                  <LuBox className="w-7 h-7 text-[var(--text-muted)]" />
                </div>
                <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2 font-display">No workspaces yet</h2>
                <p className="max-w-sm mx-auto text-sm text-[var(--text-muted)] leading-relaxed mb-6">
                  Workspaces are born from chats. When a conversation grows into something worth keeping, promote it to a workspace.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => void onCreateWorkspace()}
                    className="btn-ink rounded-xl px-5 py-2.5 text-sm font-semibold flex items-center gap-2"
                  >
                    <LuPlus className="w-4 h-4" />
                    Create a workspace
                  </button>
                </div>

                <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto text-left">
                  {[
                    { icon: <LuMessageSquare className="w-4 h-4" />, title: "Chat threads", desc: "Each workspace holds multiple scoped conversations." },
                    { icon: <LuLayers className="w-4 h-4" />, title: "Shared files", desc: "Code and files persist across threads automatically." },
                    { icon: <LuGitBranch className="w-4 h-4" />, title: "Context carry", desc: "Agents remember the full workspace when you resume." },
                  ].map((item) => (
                    <div key={item.title} className="rounded-xl bg-[var(--surface-card)] border border-[var(--glass-border)] p-4">
                      <div className="flex items-center gap-2 mb-2 text-[var(--text-primary)]">
                        {item.icon}
                        <span className="text-xs font-semibold">{item.title}</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {activeWorkspaces.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Recent</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {activeWorkspaces.map((workspace) => (
                      <WorkspaceCard
                        key={workspace.id}
                        workspace={workspace}
                        onSelect={() => onSelectWorkspace(workspace.id)}
                        isRecent
                      />
                    ))}
                  </div>
                </section>
              )}

              {olderWorkspaces.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      {activeWorkspaces.length > 0 ? "Older" : "Your workspaces"}
                    </h2>
                    <span className="text-[10px] text-[var(--text-muted)] tabular-nums">({olderWorkspaces.length})</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {olderWorkspaces.map((workspace) => (
                      <WorkspaceCard
                        key={workspace.id}
                        workspace={workspace}
                        onSelect={() => onSelectWorkspace(workspace.id)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {activeWorkspaces.length === 0 && olderWorkspaces.length === 0 && (
                <section>
                  <div className="mb-3 px-1">
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Your workspaces</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {workspaces.map((workspace) => (
                      <WorkspaceCard
                        key={workspace.id}
                        workspace={workspace}
                        onSelect={() => onSelectWorkspace(workspace.id)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ── Stat Card ───────────────────────────────────────────────────── */

function StatCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl glass-card-static p-3 sm:p-4 min-w-0 overflow-hidden">
      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
        <span className="text-[var(--text-muted)] shrink-0">{icon}</span>
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] sm:tracking-[0.15em] text-[var(--text-muted)] truncate">{label}</span>
      </div>
      <p className="text-base sm:text-lg font-bold text-[var(--text-primary)] font-display tabular-nums truncate">{value}</p>
      <p className={`text-[10px] sm:text-[11px] mt-0.5 truncate ${accent ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-[var(--text-muted)]"}`}>
        {sub}
      </p>
    </div>
  );
}

/* ── Detail Row ──────────────────────────────────────────────────── */

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-[var(--text-muted)] shrink-0">{label}</span>
      <span className={`min-w-0 text-right text-[var(--text-secondary)] ${mono ? "break-all font-mono text-[10px] opacity-60" : "truncate tabular-nums"}`}>
        {value}
      </span>
    </div>
  );
}

/* ── Workspace Card ──────────────────────────────────────────────── */

function WorkspaceCard({
  workspace,
  onSelect,
  isRecent,
}: {
  workspace: WorkspaceSummary;
  onSelect: () => void;
  isRecent?: boolean;
}) {
  const agent = getAgentProfile(workspace.agentId);
  const hueHash = workspace.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  return (
    <button
      onClick={onSelect}
      className="group relative rounded-2xl glass-card p-5 text-left overflow-hidden"
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-40 group-hover:opacity-70 transition-opacity"
        style={{ background: `hsl(${hueHash}, 50%, 55%)` }}
      />

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)]">
          <LuBox className="w-4 h-4 text-[var(--text-secondary)]" />
        </div>
        <div className="flex items-center gap-1.5">
          {isRecent && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 opacity-60" />
          )}
          <span className="text-[10px] text-[var(--text-muted)] tabular-nums">{formatRelativeDate(workspace.updatedAt)}</span>
        </div>
      </div>

      <h3 className="text-[15px] font-bold text-[var(--text-primary)] leading-snug line-clamp-2 mb-1.5 font-display">
        {workspace.name}
      </h3>

      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        {agent && (
          <span className="inline-flex items-center gap-1">
            <LuBot className="w-3 h-3 opacity-60" />
            {agent.name}
          </span>
        )}
      </div>

      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all translate-x-1 group-hover:translate-x-0">
        <LuArrowUpRight className="w-4 h-4 text-[var(--text-muted)]" />
      </div>
    </button>
  );
}

/* ── Finder List Row ─────────────────────────────────────────────── */

function FinderListRow({
  node,
  depth,
  onOpenFile,
}: {
  node: FileNode;
  depth: number;
  onOpenFile: (fileId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(depth < 1);
  const isFolder = node.type === "folder";
  const kind = getFileKind(node.name, node.type);

  const handleClick = () => {
    if (isFolder) {
      setIsExpanded(!isExpanded);
    } else {
      onOpenFile(node.id);
    }
  };

  return (
    <>
      <button
        className="group flex w-full items-center gap-2 px-4 py-[7px] text-left transition-colors hover:bg-[var(--glass-bg-strong)] focus:bg-[var(--glass-bg-strong)] focus:outline-none sm:px-5"
        style={{ paddingLeft: `${16 + depth * 20}px` }}
        onClick={handleClick}
      >
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {isFolder ? (
            isExpanded ? (
              <LuChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
            ) : (
              <LuChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
            )
          ) : null}
        </span>

        <span className="shrink-0">{getFileIcon(node.name, node.type, isExpanded)}</span>

        <span className="flex-1 min-w-0 truncate text-[13px] text-[var(--text-primary)] font-medium">
          {node.name}
        </span>

        <span className="w-28 text-right text-[11px] text-[var(--text-muted)] tabular-nums hidden sm:block shrink-0">
          {formatDateFull(node.modifiedAt.toISOString())}
        </span>

        <span className="w-20 text-right text-[11px] text-[var(--text-muted)] tabular-nums hidden md:block shrink-0">
          {isFolder ? "—" : formatFileSize(node.size)}
        </span>

        <span className="w-20 text-right text-[11px] text-[var(--text-muted)] hidden lg:block shrink-0">
          {kind}
        </span>
      </button>

      {isFolder && isExpanded && node.children?.map((child) => (
        <FinderListRow key={child.id} node={child} depth={depth + 1} onOpenFile={onOpenFile} />
      ))}
    </>
  );
}

/* ── Finder Grid Item ────────────────────────────────────────────── */

function FinderGridItem({
  node,
  onOpenFile,
}: {
  node: FileNode;
  onOpenFile: (fileId: string) => void;
}) {
  const kind = getFileKind(node.name, node.type);
  const isFolder = node.type === "folder";

  const handleClick = () => {
    if (!isFolder) onOpenFile(node.id);
  };

  return (
    <button
      onClick={handleClick}
      className={`group flex flex-col items-center gap-2 rounded-xl p-3.5 text-center transition-all ${
        isFolder
          ? "opacity-80 cursor-default"
          : "hover:bg-[var(--glass-bg-strong)] cursor-pointer"
      }`}
    >
      <div className="w-11 h-11 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center transition-transform group-hover:scale-105">
        {getFileIcon(node.name, node.type)}
      </div>
      <div className="w-full min-w-0">
        <p className="text-[11px] font-medium text-[var(--text-primary)] truncate">{node.name}</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{kind}</p>
      </div>
    </button>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */

async function fetchWorkspaceFile(fileId: string): Promise<WorkspaceFileSummary | null> {
  const response = await fetch(`/api/workspace-files/${fileId}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data.file;
}

function isCodeFile(path: string) {
  return /\.(ts|tsx|js|jsx|html|css|json|md|py)$/i.test(path);
}

function buildFileTree(files: WorkspaceFileSummary[]): FileNode[] {
  const roots: FileNode[] = [];
  const folders = new Map<string, FileNode>();

  const ensureFolder = (folderPath: string) => {
    if (folders.has(folderPath)) return folders.get(folderPath)!;
    const parts = folderPath.split("/").filter(Boolean);
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const folder: FileNode = {
      id: `folder:${folderPath}`,
      name,
      type: "folder",
      modifiedAt: new Date(),
      children: [],
    };
    folders.set(folderPath, folder);
    if (!parentPath) {
      roots.push(folder);
    } else {
      const parent = ensureFolder(parentPath);
      parent.children = parent.children || [];
      parent.children.push(folder);
    }
    return folder;
  };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    const fileName = parts.pop() || file.path;
    const parentPath = parts.join("/");
    const node: FileNode = {
      id: file.id,
      name: fileName,
      type: "file",
      size: file.size ?? undefined,
      modifiedAt: new Date(file.updatedAt),
    };
    if (!parentPath) {
      roots.push(node);
    } else {
      const parent = ensureFolder(parentPath);
      parent.children = parent.children || [];
      parent.children.push(node);
    }
  }

  return sortNodes(roots);
}

function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes]
    .map((n) => ({ ...n, children: n.children ? sortNodes(n.children) : undefined }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}
