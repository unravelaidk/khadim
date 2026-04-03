import { useState, useEffect } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { LuFileText, LuTrash2, LuMessageSquare } from "react-icons/lu";

interface ChatItem {
  id: string;
  title: string | null;
  workspaceId?: string | null;
  sandboxId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SidebarChatListProps {
  selectedChatId: string | null;
  selectedWorkspaceId?: string | null;
  currentView?: "chat" | "workspace" | "settings";
  onSelectChat: (chatId: string | null) => void;
  onNewChat: () => void;
  onClose?: () => void;
  refreshKey?: number;
  isCollapsed?: boolean;
}

export function SidebarChatList({ 
  selectedChatId,
  selectedWorkspaceId = null,
  currentView = "chat",
  onSelectChat,
  onNewChat,
  onClose,
  refreshKey = 0,
  isCollapsed = false
}:SidebarChatListProps) {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChats();
  }, [refreshKey, selectedWorkspaceId, currentView]);

  const fetchChats = async () => {
    try {
      setLoading(true);
      const query = currentView === "workspace" && selectedWorkspaceId
        ? `?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`
        : "";
      const response = await fetch(`/api/chats${query}`);
      if (response.ok) {
        const data = await response.json();
        setChats(data.chats);
      }
    } catch (error) {
      console.error("Failed to fetch chats:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;

    try {
      const formData = new FormData();
      formData.append("chatId", chatId);
      await fetch("/api/chats", { method: "DELETE", body: formData });
      setChats(chats.filter(c => c.id !== chatId));
      if (selectedChatId === chatId) {
        onSelectChat(null);
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  if (isCollapsed) {
    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-2 flex flex-col gap-1">
            {loading ? (
              <div className="p-3 flex justify-center">
                <div className="w-4 h-4 rounded-full border-2 border-[#10150a] border-t-transparent animate-spin" />
              </div>
            ) : chats.length === 0 ? (
              <button
                onClick={() => {
                  onNewChat();
                  if (onClose) onClose();
                }}
                className="p-3 flex justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] rounded-xl transition-colors"
                title="New Chat"
              >
                <LuMessageSquare className="w-5 h-5" />
              </button>
            ) : (
              chats.slice(0, 5).map((chat) => {
                const isSelected = chat.id === selectedChatId;
                return (
<button
                      key={chat.id}
                      onClick={() => {
                        onSelectChat(chat.id);
                        if (onClose) onClose();
                      }}
                      className={`
                      p-3 flex justify-center rounded-xl transition-all relative group
                      ${isSelected 
                        ? "border border-black/80 bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)]" 
                        : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                      }
                    `}
                    title={chat.title || "Untitled Chat"}
                  >
                    <LuFileText className="w-5 h-5" />
                    {!isSelected && (
                      <button
                        onClick={(e) => handleDeleteChat(e, chat.id)}
                        className="absolute right-1 top-1 p-1 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete"
                      >
                        <LuTrash2 className="w-3 h-3" />
                      </button>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-4 py-2 border-b border-[var(--glass-border)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Recent chats</span>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]" style={{ opacity: 0.6 }}>
              {currentView === "workspace" && selectedWorkspaceId ? "Workspace chats" : "Unified inbox"}
            </p>
          </div>
          <span className="text-xs text-[var(--text-muted)]">{chats.length}</span>
        </div>
      </div>

      <ScrollArea className="flex-1 px-2">
        {loading ? (
          <div className="px-3 py-4 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full border-2 border-[#10150a] border-t-transparent animate-spin" />
          </div>
        ) : chats.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <LuMessageSquare className="w-8 h-8 mx-auto mb-2 text-[var(--text-muted)]" style={{ opacity: 0.4 }} />
            <p className="text-xs text-[var(--text-muted)]">No chats yet</p>
            <button
              onClick={() => {
                onNewChat();
                if (onClose) onClose();
              }}
              className="mt-3 text-xs font-medium text-[var(--text-primary)] underline underline-offset-2"
            >
              Start a conversation
            </button>
          </div>
        ) : (
          <div className="py-2 space-y-0.5">
            {chats.map((chat) => {
              const isSelected = chat.id === selectedChatId;

              return (
                <div key={chat.id} className="group relative">
<button
                      onClick={() => {
                        onSelectChat(chat.id);
                        if (onClose) onClose();
                      }}
                      className={`
                      w-full flex items-center gap-2 px-3 py-2 text-left rounded-xl transition-all
                      ${isSelected 
                        ? "border border-black/80 bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)]" 
                        : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                      }
                    `}
                  >
                     <LuFileText className="w-4 h-4 shrink-0" />
                     <span className="block truncate text-sm">{chat.title || "Untitled Chat"}</span>
                   </button>

                  {!isSelected && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--glass-bg-strong)]"
                      onClick={(e) => handleDeleteChat(e, chat.id)}
                      title="Delete chat"
                    >
                      <LuTrash2 className="h-3.5 w-3.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
