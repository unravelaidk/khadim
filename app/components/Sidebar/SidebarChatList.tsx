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
}: SidebarChatListProps) {
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
                <div className="w-4 h-4 border-2 border-black border-t-transparent animate-spin" />
              </div>
            ) : chats.length === 0 ? (
              <button
                onClick={() => {
                  onNewChat();
                  if (onClose) onClose();
                }}
                className="p-3 flex justify-center text-black/40 hover:text-black hover:bg-black/5 transition-colors"
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
                      p-3 flex justify-center transition-colors relative group
                      ${isSelected 
                        ? "bg-black text-white" 
                        : "text-black/70 hover:bg-black/5 hover:text-black"
                      }
                    `}
                    title={chat.title || "Untitled Chat"}
                  >
                    <LuFileText className="w-5 h-5" />
                    {!isSelected && (
                      <button
                        onClick={(e) => handleDeleteChat(e, chat.id)}
                        className="absolute right-1 top-1 p-1 bg-white border border-black text-black opacity-0 group-hover:opacity-100 transition-opacity"
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
      <div className="px-4 py-2 border-b border-black/10">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-black/50">Recent chats</span>
            <p className="text-[10px] uppercase tracking-[0.2em] text-black/30">
              {currentView === "workspace" && selectedWorkspaceId ? "Workspace chats" : "Unified inbox"}
            </p>
          </div>
          <span className="text-xs text-black/30">{chats.length}</span>
        </div>
      </div>

      <ScrollArea className="flex-1 px-2">
        {loading ? (
          <div className="px-3 py-4 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-black border-t-transparent animate-spin" />
          </div>
        ) : chats.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <LuMessageSquare className="w-8 h-8 mx-auto mb-2 text-black/20" />
            <p className="text-xs text-black/40">No chats yet</p>
            <button
              onClick={() => {
                onNewChat();
                if (onClose) onClose();
              }}
              className="mt-3 text-xs font-medium text-black hover:underline"
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
                      w-full flex items-center gap-2 px-3 py-2 text-left transition-all
                      ${isSelected 
                        ? "bg-black text-white" 
                        : "text-black/70 hover:bg-black/5 hover:text-black"
                      }
                    `}
                  >
                     <LuFileText className="w-4 h-4 shrink-0" />
                     <span className="block truncate text-sm">{chat.title || "Untitled Chat"}</span>
                   </button>

                  {!isSelected && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/10"
                      onClick={(e) => handleDeleteChat(e, chat.id)}
                      title="Delete chat"
                    >
                      <LuTrash2 className="h-3.5 w-3.5 text-black/50 hover:text-black" />
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
