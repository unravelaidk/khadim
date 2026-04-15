import { useEffect, useMemo, useState } from "react";
import {
  useChatMemoryStoreQuery,
  useCreateMemoryEntryMutation,
  useDeleteMemoryEntryMutation,
  useMemoryEntriesQuery,
  useMemoryStoresQuery,
  useSettingQuery,
  useUpdateMemoryEntryMutation,
} from "../../lib/queries";

export function MemoryView() {
  const { data: chatStore = null } = useChatMemoryStoreQuery(null);
  const { data: allStores = [] } = useMemoryStoresQuery();
  const { data: chatAutoAccessShared = null } = useSettingQuery("memory:chat_auto_access_shared");
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const createEntry = useCreateMemoryEntryMutation();
  const updateEntry = useUpdateMemoryEntryMutation();
  const deleteEntry = useDeleteMemoryEntryMutation();

  const visibleStores = useMemo(() => {
    const stores = chatStore ? [chatStore] : [];
    if (chatAutoAccessShared === "true") {
      for (const store of allStores) {
        if (
          store.id !== chatStore?.id
          && store.scopeType === "shared"
          && store.chatReadAccess === "read"
          && store.workspaceId == null
        ) {
          stores.push(store);
        }
      }
    }
    return stores;
  }, [allStores, chatAutoAccessShared, chatStore]);

  useEffect(() => {
    if (!selectedStoreId && chatStore?.id) {
      setSelectedStoreId(chatStore.id);
    }
  }, [chatStore, selectedStoreId]);

  useEffect(() => {
    if (selectedStoreId && visibleStores.every((store) => store.id !== selectedStoreId)) {
      setSelectedStoreId(chatStore?.id ?? null);
    }
  }, [chatStore, selectedStoreId, visibleStores]);

  const selectedStore = visibleStores.find((store) => store.id === selectedStoreId) ?? chatStore;
  const { data: entries = [] } = useMemoryEntriesQuery(selectedStore?.id ?? null, Boolean(selectedStore?.id));

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) =>
      entry.key.toLowerCase().includes(needle)
      || entry.content.toLowerCase().includes(needle)
      || entry.kind.toLowerCase().includes(needle),
    );
  }, [entries, query]);

  const canWrite = selectedStore?.id === chatStore?.id;

  async function handleCreateEntry() {
    if (!chatStore || !draftKey.trim() || !draftContent.trim()) return;
    await createEntry.mutateAsync({
      store_id: chatStore.id,
      key: draftKey.trim(),
      content: draftContent.trim(),
      kind: "fact",
      is_pinned: false,
    });
    setDraftKey("");
    setDraftContent("");
    setSelectedStoreId(chatStore.id);
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex w-[280px] shrink-0 flex-col border-r border-[var(--glass-border)]">
        <div className="px-4 pt-6 pb-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Memory</p>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            Chat writes to its own store. Shared memory is read-only here.
          </p>
        </div>

        <div className="px-3 pb-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search memory"
            className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] h-9 w-full rounded-full px-4 text-[13px]"
          />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4">
          {visibleStores.map((store) => {
            const active = store.id === selectedStore?.id;
            const isChatStore = store.id === chatStore?.id;
            return (
              <button
                key={store.id}
                onClick={() => setSelectedStoreId(store.id)}
                className={`mb-2 flex w-full flex-col rounded-[10px] px-3 py-2 text-left transition-colors ${
                  active ? "bg-[var(--color-accent-subtle)]" : "hover:bg-[var(--glass-bg)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{store.name}</span>
                  <span className="ml-auto rounded-full border border-[var(--glass-border)] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    {isChatStore ? "Chat" : "Shared"}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                  {store.description || (isChatStore ? "Facts and preferences saved from chat." : "Shared memory visible to chat.")}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selectedStore ? (
          <div className="flex h-full items-center justify-center px-8 text-center text-[13px] text-[var(--text-muted)]">
            Loading memory store...
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-[var(--glass-border)] px-8 py-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-[20px] font-semibold text-[var(--text-primary)]">{selectedStore.name}</h2>
                  <span className="rounded-full border border-[var(--glass-border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    {selectedStore.id === chatStore?.id ? "Writeable" : "Read only"}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                  {selectedStore.id === chatStore?.id
                    ? "Use this store for durable facts, preferences, and recurring context from chat."
                    : "This shared store is visible to chat because you enabled chat access in Settings and the store allows chat reads."}
                </p>
              </div>
              <div className="text-right text-[11px] text-[var(--text-muted)]">
                <div>{filteredEntries.length} visible</div>
                <div>{entries.length} total entries</div>
              </div>
            </div>

            {canWrite && (
              <div className="border-b border-[var(--glass-border)] px-8 py-5">
                <div className="grid gap-3">
                  <input
                    value={draftKey}
                    onChange={(event) => setDraftKey(event.target.value)}
                    placeholder="Short memory key"
                    className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] h-10 rounded-xl px-4 text-[13px]"
                  />
                  <textarea
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    placeholder="Save a durable fact or preference from chat"
                    className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] min-h-[110px] rounded-xl px-4 py-3 text-[13px]"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => void handleCreateEntry()}
                      disabled={!draftKey.trim() || !draftContent.trim() || createEntry.isPending}
                      className="btn-ink h-9 rounded-full px-5 text-[12px] font-semibold disabled:opacity-50"
                    >
                      {createEntry.isPending ? "Saving..." : "Save memory"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-thin px-8 py-5">
              {filteredEntries.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--glass-border)] px-6 py-10 text-center">
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">No memory entries yet</p>
                  <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                    {canWrite
                      ? "Save important details from chat so the agent can reuse them later."
                      : "No shared memory entries are visible in this store yet."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredEntries.map((entry) => (
                    <div key={entry.id} className="depth-card-sm p-4">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{entry.key}</p>
                            <span className="rounded-full bg-[var(--surface-ink-5)] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                              {entry.kind}
                            </span>
                            {entry.isPinned && (
                              <span className="rounded-full bg-[var(--color-accent-subtle)] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--color-accent)]">
                                pinned
                              </span>
                            )}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-secondary)]">{entry.content}</p>
                          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-[var(--text-muted)]">
                            <span>{Math.round(entry.confidence * 100)}% confidence</span>
                            <span>{entry.recallCount} recalls</span>
                            {entry.sourceConversationId && <span>conversation {entry.sourceConversationId.slice(0, 8)}</span>}
                          </div>
                        </div>

                        {canWrite && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => void updateEntry.mutateAsync({
                                id: entry.id,
                                input: {
                                  store_id: entry.storeId,
                                  key: entry.key,
                                  content: entry.content,
                                  kind: entry.kind,
                                  source_session_id: entry.sourceSessionId,
                                  source_conversation_id: entry.sourceConversationId,
                                  source_message_id: entry.sourceMessageId,
                                  confidence: entry.confidence,
                                  is_pinned: !entry.isPinned,
                                },
                              })}
                              className="rounded-full px-3 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                            >
                              {entry.isPinned ? "Unpin" : "Pin"}
                            </button>
                            <button
                              onClick={() => deleteEntry.mutate({ id: entry.id, storeId: entry.storeId })}
                              className="rounded-full px-3 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--color-danger-muted)] hover:text-[var(--color-danger-text)]"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
