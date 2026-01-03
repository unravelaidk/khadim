import { useState, useEffect } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { LuListFilter, LuFileText, LuPlus, LuTrash2 } from "react-icons/lu";

interface ChatItem {
  id: string;
  title: string | null;
  sandboxId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SidebarChatListProps {
  selectedChatId: string | null;
  onSelectChat: (chatId: string | null) => void;
  onNewChat: () => void;
  onClose?: () => void;
  refreshKey?: number;
}

export function SidebarChatList({ 
  selectedChatId,
  onSelectChat,
  onNewChat,
  onClose,
  refreshKey = 0
}: SidebarChatListProps) {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChats();
  }, [refreshKey]);

  const fetchChats = async () => {
    try {
      const response = await fetch("/api/chats");
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

  return (
    <div className="gb-section gb-section-grow">
      <div className="gb-section-header">
        <span>All chats</span>
        <div className="flex items-center gap-1">
          <button 
            className="gb-icon-btn-sm" 
            title="New Chat"
            onClick={() => {
              onNewChat();
              if (onClose) onClose();
            }}
          >
            <LuPlus className="w-3.5 h-3.5" />
          </button>
          <button className="gb-icon-btn-sm" title="Filter">
            <LuListFilter className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <ScrollArea className="gb-chat-list">
        {loading ? (
          <div className="px-3 py-2 text-sm text-gb-text-muted">Loading...</div>
        ) : chats.length === 0 ? (
          <div className="px-3 py-4 text-sm text-gb-text-muted text-center">
            No chats yet. Start a conversation!
          </div>
        ) : (
          chats.map((chat) => {
            const isSelected = chat.id === selectedChatId;

            return (
              <button
                key={chat.id}
                className={`gb-chat-item group ${isSelected ? "gb-chat-item-selected" : ""}`}
                onClick={() => {
                   onSelectChat(chat.id);
                   if (onClose) onClose();
                }}
              >
                <LuFileText className="w-4 h-4 shrink-0" />
                <span className="gb-chat-name">{chat.title || "Untitled Chat"}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-opacity shrink-0"
                  onClick={(e) => handleDeleteChat(e, chat.id)}
                  title="Delete chat"
                >
                  <LuTrash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </button>
            );
          })
        )}
      </ScrollArea>
    </div>
  );
}
