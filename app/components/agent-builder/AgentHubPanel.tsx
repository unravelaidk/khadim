import { useEffect, useState, useCallback } from "react";
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
  LuActivity,
  LuBot,
  LuClock,
  LuGrid3X3,
  LuList,
  LuSearch,
  LuSlidersHorizontal,
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

function getFileIcon(name: string, type: "file" | "folder", isOpen = false) {
  if (type === "folder") {
    return isOpen ? (
      <LuFolderOpen className="w-[18px] h-[18px] text-[#5BA0D0]" />
    ) : (
      <LuFolder className="w-[18px] h-[18px] text-[#5BA0D0]" />
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
      return <LuFileCode2 className="w-[18px] h-[18px] text-[#8B9F78]" />;
    case "html":
    case "htm":
      return <LuGlobe className="w-[18px] h-[18px] text-[#D08B5B]" />;
    case "json":
      return <LuFileJson className="w-[18px] h-[18px] text-[#C4A35A]" />;
    case "csv":
    case "xlsx":
    case "xls":
      return <LuFileSpreadsheet className="w-[18px] h-[18px] text-[#5BA070]" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
      return <LuFileImage className="w-[18px] h-[18px] text-[#B07DB0]" />;
    case "md":
    case "txt":
      return <LuFileText className="w-[18px] h-[18px] text-[var(--text-muted)]" />;
    default:
      return <LuFile className="w-[18px] h-[18px] text-[var(--text-muted)]" />;
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

function formatDate(value: string) {
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

    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden p-4 md:p-6 lg:p-8">
        {/* ── Top Bar ── */}
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSelectWorkspace(null)}
              className="flex items-center justify-center w-9 h-9 rounded-xl btn-glass transition-all hover:shadow-[var(--shadow-glass-sm)]"
              title="All workspaces"
            >
              <LuArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                {detail.workspace.name}
              </h1>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--text-muted)]">
                <span>{agent?.name ?? "Agent"}</span>
                <span className="h-1 w-1 rounded-full bg-[var(--text-muted)] opacity-40" />
                <span>{detail.files.length} items</span>
                <span className="h-1 w-1 rounded-full bg-[var(--text-muted)] opacity-40" />
                <span>{formatFileSize(totalSize)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => void onCreateChatInWorkspace()}
            className="btn-ink rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-2"
          >
            <LuPlus className="w-4 h-4" />
            New chat
          </button>
        </header>

        {/* ── Main Grid ── */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">

          {/* ── Files Panel (Finder-style) ── */}
          <section className="min-h-0 rounded-2xl glass-panel-strong flex flex-col overflow-hidden">
            {/* Finder toolbar */}
            <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-border)] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <LuFolder className="w-4 h-4 text-[var(--text-muted)]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">Files</span>
                <span className="text-xs text-[var(--text-muted)] tabular-nums">({detail.files.length})</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <LuSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="glass-input h-8 w-44 rounded-lg pl-8 pr-3 text-xs"
                  />
                </div>
                {/* View toggle */}
                <div className="flex rounded-lg border border-[var(--glass-border)] overflow-hidden">
                  <button
                    onClick={() => setFileViewMode("list")}
                    className={`p-1.5 transition-colors ${fileViewMode === "list" ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                    title="List view"
                  >
                    <LuList className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setFileViewMode("grid")}
                    className={`p-1.5 transition-colors ${fileViewMode === "grid" ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                    title="Grid view"
                  >
                    <LuGrid3X3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Column headers (list view) */}
            {fileViewMode === "list" && (
              <div className="flex items-center gap-2 border-b border-[var(--glass-border)] px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)] select-none">
                <span className="flex-1 min-w-0">Name</span>
                <span className="w-24 text-right hidden sm:block">Date Modified</span>
                <span className="w-20 text-right hidden md:block">Size</span>
                <span className="w-24 text-right hidden lg:block">Kind</span>
              </div>
            )}

            {/* File content */}
            <ScrollArea className="flex-1">
              {displayTree.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)]">
                  {searchQuery ? (
                    <>
                      <LuSearch className="w-8 h-8 mb-3 opacity-30" />
                      <p className="text-sm">No files matching "{searchQuery}"</p>
                    </>
                  ) : (
                    <>
                      <LuFolder className="w-10 h-10 mb-3 opacity-20" />
                      <p className="text-sm font-medium">No files yet</p>
                      <p className="text-xs mt-1 opacity-60">Files created in workspace chats will appear here</p>
                    </>
                  )}
                </div>
              ) : fileViewMode === "list" ? (
                <div className="py-1">
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
            </ScrollArea>
          </section>

          {/* ── Right Sidebar: Activity ── */}
          <aside className="min-h-0 flex flex-col gap-5 overflow-auto scrollbar-thin">
            {/* Active agents */}
            <section className="rounded-2xl glass-card-static p-5 shadow-[var(--shadow-glass-sm)]">
              <div className="flex items-center gap-2 mb-4">
                <LuActivity className="w-4 h-4 text-[var(--text-primary)]" />
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">Active Agents</span>
              </div>
              {detail.activeAgents.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-2">No active agents right now</p>
              ) : (
                <div className="space-y-2">
                  {detail.activeAgents.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-xl bg-[var(--glass-bg)] px-3 py-2.5 border border-[var(--glass-border)]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">{a.name}</span>
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{a.activeChatCount} chat{a.activeChatCount !== 1 ? "s" : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Chats */}
            <section className="rounded-2xl glass-card-static p-5 shadow-[var(--shadow-glass-sm)] flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <LuMessageSquare className="w-4 h-4 text-[var(--text-muted)]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">Chats</span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{detail.chats.length}</span>
              </div>
              <ScrollArea className="flex-1 -mr-2 pr-2">
                {detail.chats.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] py-2">No chats linked to this workspace yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.chats.map((chat) => (
                      <button
                        key={chat.id}
                        onClick={() => onSelectChat(chat.id)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:bg-[var(--glass-bg-strong)] group"
                      >
                        <LuMessageSquare className="w-4 h-4 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{chat.title || "Untitled Chat"}</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
                            {chat.isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />}
                            {chat.isActive
                              ? `Active${chat.activeAgentId ? ` · ${getAgentProfile(chat.activeAgentId)?.name ?? ""}` : ""}`
                              : formatRelativeDate(chat.updatedAt)
                            }
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </section>
          </aside>
        </div>

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

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden p-4 md:p-6 lg:p-8">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)] font-semibold">Workspace</p>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            Turn important chats into durable workspaces.
          </h1>
          <p className="max-w-2xl text-sm text-[var(--text-secondary)]">
            Workspaces keep files, code, and related chat threads together. Start one from a chat, then keep building inside that shared context.
          </p>
        </div>
        <button
          onClick={() => void onCreateWorkspace()}
          className="btn-ink rounded-xl px-5 py-2.5 text-sm font-semibold flex items-center gap-2 shrink-0"
        >
          <LuPlus className="w-4 h-4" />
          New workspace
        </button>
      </header>

      <ScrollArea className="flex-1 -mr-4 pr-4">
        <div className="space-y-10 pb-20">
          {/* Workspaces */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Your workspaces</h2>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">{workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-5 h-5 rounded-full border-2 border-[var(--text-primary)] border-t-transparent animate-spin" />
              </div>
            ) : workspaces.length === 0 ? (
              <EmptyCard label="No workspaces yet. Start one from a chat or create a blank workspace." />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {workspaces.map((workspace) => {
                  const agent = getAgentProfile(workspace.agentId);
                  return (
                    <button
                      key={workspace.id}
                      onClick={() => onSelectWorkspace(workspace.id)}
                      className="group rounded-2xl glass-card p-5 text-left"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] flex items-center justify-center">
                          <LuFolder className="w-5 h-5 text-[var(--text-primary)]" />
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                          <LuClock className="w-3 h-3" />
                          <span>{formatRelativeDate(workspace.updatedAt)}</span>
                        </div>
                      </div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-medium mb-1">
                        {agent?.name ?? workspace.agentId}
                      </p>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)] leading-snug line-clamp-2">
                        {workspace.name}
                      </h3>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Agent Overview */}
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Agents</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Available agents for workspace chats</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {agentProfiles.map((agent) => (
                <div key={agent.id} className="rounded-2xl glass-card-static p-5 shadow-[var(--shadow-glass-sm)]">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] flex items-center justify-center">
                      <LuBot className="w-4 h-4 text-[var(--text-secondary)]" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-medium">{agent.kind}</p>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{agent.name}</h3>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{agent.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
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
        className="group flex w-full items-center gap-2 px-4 py-[7px] text-left transition-colors hover:bg-[var(--glass-bg-strong)] focus:bg-[var(--glass-bg-strong)] focus:outline-none"
        style={{ paddingLeft: `${16 + depth * 20}px` }}
        onClick={handleClick}
      >
        {/* Expand chevron */}
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {isFolder ? (
            isExpanded ? (
              <LuChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
            ) : (
              <LuChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
            )
          ) : null}
        </span>

        {/* Icon */}
        <span className="shrink-0">{getFileIcon(node.name, node.type, isExpanded)}</span>

        {/* Name */}
        <span className="flex-1 min-w-0 truncate text-[13px] text-[var(--text-primary)] font-medium">
          {node.name}
        </span>

        {/* Date */}
        <span className="w-24 text-right text-[12px] text-[var(--text-muted)] tabular-nums hidden sm:block shrink-0">
          {formatDateFull(node.modifiedAt.toISOString())}
        </span>

        {/* Size */}
        <span className="w-20 text-right text-[12px] text-[var(--text-muted)] tabular-nums hidden md:block shrink-0">
          {isFolder ? "—" : formatFileSize(node.size)}
        </span>

        {/* Kind */}
        <span className="w-24 text-right text-[12px] text-[var(--text-muted)] hidden lg:block shrink-0">
          {kind}
        </span>
      </button>

      {/* Children */}
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
      className={`group flex flex-col items-center gap-2 rounded-xl p-4 text-center transition-all ${
        isFolder
          ? "opacity-80 cursor-default"
          : "hover:bg-[var(--glass-bg-strong)] cursor-pointer"
      }`}
    >
      <div className="w-12 h-12 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center transition-transform group-hover:scale-105">
        {getFileIcon(node.name, node.type)}
      </div>
      <div className="w-full min-w-0">
        <p className="text-xs font-medium text-[var(--text-primary)] truncate">{node.name}</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{kind}</p>
      </div>
    </button>
  );
}

/* ── Empty Card ──────────────────────────────────────────────────── */

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] p-10 text-center">
      <LuFolder className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)] opacity-30" />
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
    </div>
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
