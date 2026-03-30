import { useEffect, useState } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { agentProfiles, getAgentProfile } from "../../lib/agent-profiles";
import type { FileNode } from "../workspace/workspace-types";
import { FileEditorModal } from "./FileEditorModal";
import { showError, showSuccess } from "../../lib/toast";

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
          if (!cancelled) {
            setDetail(data);
          }
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
    intervalId = setInterval(() => {
      void load(false);
    }, 5000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [selectedWorkspaceId]);

  const handleOpenFile = async (fileId: string) => {
    const file = await fetchWorkspaceFile(fileId);
    if (!file) {
      showError("Failed to open file.");
      return;
    }
    setSelectedFile(file);
  };

  const handleSaveFile = async (content: string) => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("content", content);

    const response = await fetch(`/api/workspace-files/${selectedFile.id}`, {
      method: "PATCH",
      body: formData,
    });

    if (!response.ok) {
      showError("Failed to save file.");
      return;
    }

    const data = await response.json();
    const updatedFile = data.file as WorkspaceFileSummary;
    setSelectedFile(updatedFile);
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            files: prev.files.map((file) => (file.id === updatedFile.id ? updatedFile : file)),
          }
        : prev
    );
    showSuccess("Workspace file saved.");
  };

  if (selectedWorkspaceId && detail) {
    const agent = getAgentProfile(detail.workspace.agentId);
    const fileTree = buildFileTree(detail.files);

    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden  p-6 md:p-9">
        <header className="mb-8 rounded-2xl glass-card-static p-6 shadow-[var(--shadow-glass-sm)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">
                <span>{agent?.name ?? "Workspace"}</span>
                <span className="h-1 w-1 rounded-full bg-black/30" />
                <span>{detail.files.length} files</span>
                <span className="h-1 w-1 rounded-full bg-black/30" />
                <span>{detail.chats.length} chats</span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">{detail.workspace.name}</h1>
              <p className="max-w-2xl text-sm text-[var(--text-secondary)]">
                This workspace stores agent-related files and keeps the chat threads attached to the same stream of work.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => onSelectWorkspace(null)}
                className="rounded-xl btn-ink px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-strong)]"
              >
                All workspaces
              </button>
              <button
                onClick={() => void onCreateChatInWorkspace()}
                className="btn-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1c2214]"
              >
                New workspace chat
              </button>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="min-h-0 rounded-2xl glass-card-static p-5 shadow-[var(--shadow-glass-sm)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Files</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Workspace files</h2>
              </div>
              <span className="text-xs text-[var(--text-muted)]">Synced from workspace chats</span>
            </div>
            <ScrollArea className="h-[32rem] pr-4">
              {fileTree.length === 0 ? (
                <EmptyCard label="No files saved yet. Create or edit files in a workspace chat and they will appear here." />
              ) : (
                <div className="space-y-3 pb-6">
                  {fileTree.map((node) => (
                    <FileTreeNode key={node.id} node={node} depth={0} onOpenFile={handleOpenFile} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </section>

          <section className="min-h-0 rounded-2xl glass-card-static p-5 shadow-[var(--shadow-glass-sm)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Activity</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Active chats and agents</h2>
              </div>
            </div>
            <ScrollArea className="h-[32rem] pr-4">
              <div className="space-y-6 pb-6">
                <div>
                  <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Active agents</p>
                  {detail.activeAgents.length === 0 ? (
                    <EmptyCard label="No active agents right now." />
                  ) : (
                    <div className="space-y-3">
                      {detail.activeAgents.map((agent) => (
                        <div key={agent.id} className="rounded-2xl rounded-xl btn-ink px-4 py-3">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{agent.name}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                            {agent.activeChatCount} active chat{agent.activeChatCount === 1 ? "" : "s"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Workspace chats</p>
                  {detail.chats.length === 0 ? (
                    <EmptyCard label="No chats are linked to this workspace yet." />
                  ) : (
                    <div className="space-y-3">
                      {detail.chats.map((chat) => (
                        <button
                          key={chat.id}
                          onClick={() => onSelectChat(chat.id)}
                          className="flex w-full items-center justify-between rounded-2xl glass-card-static px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-glass-sm)]"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{chat.title || "Untitled Chat"}</p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                              {chat.isActive ? `Active now${chat.activeAgentId ? ` · ${getAgentProfile(chat.activeAgentId)?.name ?? chat.activeAgentId}` : ""}` : "Workspace chat"}
                            </p>
                          </div>
                          <span className="text-xs text-[var(--text-muted)]">{formatDate(chat.updatedAt)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </section>
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

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden  p-6 md:p-9">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Workspace</p>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">Turn important chats into durable workspaces.</h1>
          <p className="max-w-3xl text-sm text-[var(--text-secondary)]">
            Workspaces keep files, code, and related chat threads together. Start one from a chat, then keep building inside that shared context.
          </p>
        </div>

        <button
          onClick={() => void onCreateWorkspace()}
          className="btn-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1c2214]"
        >
          New workspace
        </button>
      </header>

      <ScrollArea className="flex-1 -mr-4 pr-4">
        <div className="space-y-8 pb-20">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Current workspaces</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Existing workspaces</h2>
              </div>
            </div>
            {loading ? (
              <EmptyCard label="Loading workspaces..." />
            ) : workspaces.length === 0 ? (
              <EmptyCard label="No workspaces yet. Start one from a chat or create a blank workspace here." />
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {workspaces.map((workspace) => {
                  const agent = getAgentProfile(workspace.agentId);
                  return (
                    <button
                      key={workspace.id}
                      onClick={() => onSelectWorkspace(workspace.id)}
                      className="rounded-3xl glass-card-static p-6 text-left shadow-[var(--shadow-glass-sm)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-glass-md)]"
                    >
                      <div className="mb-6 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">{agent?.name ?? workspace.agentId}</p>
                          <h3 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{workspace.name}</h3>
                        </div>
                        <span className="rounded-full rounded-xl btn-ink px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Open</span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">Updated {formatDate(workspace.updatedAt)}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="mb-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Current agents</p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Agent overview</h2>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {agentProfiles.map((agent) => (
                <div key={agent.id} className="rounded-3xl glass-card-static p-6 shadow-[var(--shadow-glass-sm)]">
                  <p className="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">{agent.kind}</p>
                  <h3 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{agent.name}</h3>
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">{agent.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

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
    .map((node) => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function FileTreeNode({ node, depth, onOpenFile }: { node: FileNode; depth: number; onOpenFile: (fileId: string) => void }) {
  return (
    <div>
      <div
        className={`rounded-xl border border-black/10 bg-[var(--glass-bg)] px-3 py-2 text-sm text-[var(--text-primary)] ${node.type === "file" ? "cursor-pointer hover:bg-[var(--glass-bg-strong)]" : ""}`}
        style={{ marginLeft: `${depth * 16}px` }}
        onClick={node.type === "file" ? () => onOpenFile(node.id) : undefined}
      >
        <span className="font-medium">{node.type === "folder" ? "[DIR]" : "[FILE]"}</span> {node.name}
      </div>
      {node.children?.length ? (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <FileTreeNode key={child.id} node={child} depth={depth + 1} onOpenFile={onOpenFile} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] p-8 text-sm text-[var(--text-muted)]">{label}</div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
