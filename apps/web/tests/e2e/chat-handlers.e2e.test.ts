import { describe, it, expect, beforeEach, vi } from "vitest";

// Shared in-memory store for mocked DB
const store = vi.hoisted(() => ({
  chats: [] as any[],
  messages: [] as any[],
  artifacts: [] as any[],
}));

// Mock drizzle helpers
vi.mock("drizzle-orm", () => ({
  eq: (...args: any[]) => ({ eq: args }),
  desc: (col: any) => ({ desc: col }),
  asc: (col: any) => ({ asc: col }),
}));

// Mock db layer with lightweight in-memory behaviors
vi.mock("../../app/lib/db", () => {
  const chats = { id: "id", updatedAt: "updatedAt", createdAt: "createdAt" };
  const messages = { id: "id", chatId: "chatId", createdAt: "createdAt" };
  const artifacts = { chatId: "chatId" };

  const getArray = (table: any) => {
    if (table === chats) return store.chats;
    if (table === messages) return store.messages;
    return store.artifacts;
  };

  const db = {
    select: () => ({
      from: (table: any) => {
        const data = getArray(table);
        const orderBy = () => {
          const arr = [...data];
          (arr as any).orderBy = () => [...arr];
          return arr;
        };
        return {
          where: (condition: any) => {
            if (condition?.eq) {
              const [col, value] = condition.eq;
              const filtered = data.filter((item: any) => item[col] === value);
              const arr = [...filtered] as any;
              arr.orderBy = () => [...filtered];
              return arr;
            }
            const arr = [...data] as any;
            arr.orderBy = () => [...data];
            return arr;
          },
          orderBy,
        };
      },
    }),
    insert: (table: any) => ({
      values: (vals: any) => ({
        returning: () => {
          const data = getArray(table);
          const rows = Array.isArray(vals) ? vals : [vals];
          const results = rows.map((row: any, idx: number) => {
            const id = row.id ?? `id-${data.length + idx + 1}`;
            const now = new Date();
            const record = {
              ...row,
              id,
              createdAt: row.createdAt ?? now,
              updatedAt: row.updatedAt ?? now,
            };
            data.push(record);
            return record;
          });
          return results;
        },
      }),
    }),
    update: (table: any) => ({
      set: (vals: any) => ({
        where: (condition: any) => {
          const data = getArray(table);
          const [col, value] = condition.eq;
          const updated: any[] = [];
          data.forEach((item: any, idx: number) => {
            if (item[col] === value) {
              const record = { ...item, ...vals };
              data[idx] = record;
              updated.push(record);
            }
          });
          return { returning: () => updated };
        },
      }),
    }),
    delete: (table: any) => ({
      where: (condition: any) => {
        const data = getArray(table);
        const [col, value] = condition.eq;
        const remaining = data.filter((item: any) => item[col] !== value);
        if (table === chats) store.chats = remaining;
        else if (table === messages) store.messages = remaining;
        else store.artifacts = remaining;
      },
    }),
  };

  return { db, chats, messages, artifacts };
});

// Import routes after mocks
import * as ChatsRoute from "../../app/routes/api.chats";
import * as ChatsIdRoute from "../../app/routes/api.chats.$id";
import * as MessagesRoute from "../../app/routes/api.messages";

describe("Chat + Messages handler E2E (mocked DB)", () => {
  beforeEach(() => {
    store.chats.length = 0;
    store.messages.length = 0;
    store.artifacts.length = 0;
  });

  it("creates a chat, posts messages, and fetches history", async () => {
    // Create chat
    const createReq = new Request("http://local/api/chats", {
      method: "POST",
      body: new FormData(),
    });
    const createRes = await ChatsRoute.action({ request: createReq } as any);
    const { chat } = await createRes.json();

    // Post user message
    const msgForm = new FormData();
    msgForm.append("chatId", chat.id);
    msgForm.append("role", "user");
    msgForm.append("content", "Hello");
    const msgReq = new Request("http://local/api/messages", { method: "POST", body: msgForm });
    await MessagesRoute.action({ request: msgReq } as any);

    // Fetch chat + messages
    const getRes = await ChatsIdRoute.loader({ params: { id: chat.id } } as any);
    const data = await getRes.json();

    expect(data.chat.id).toBe(chat.id);
    expect(data.chat.messages.length).toBe(1);
    expect(data.chat.messages[0].content).toBe("Hello");
  });

  it("isolates history when switching between chats", async () => {
    // Chat A
    const formA = new FormData();
    const resA = await ChatsRoute.action({ request: new Request("http://x", { method: "POST", body: formA }) } as any);
    const { chat: chatA } = await resA.json();
    const msgA = new FormData();
    msgA.append("chatId", chatA.id);
    msgA.append("role", "assistant");
    msgA.append("content", "Hi from A");
    await MessagesRoute.action({ request: new Request("http://x", { method: "POST", body: msgA }) } as any);

    // Chat B
    const resB = await ChatsRoute.action({ request: new Request("http://x", { method: "POST", body: new FormData() }) } as any);
    const { chat: chatB } = await resB.json();
    const msgB = new FormData();
    msgB.append("chatId", chatB.id);
    msgB.append("role", "user");
    msgB.append("content", "Hello from B");
    await MessagesRoute.action({ request: new Request("http://x", { method: "POST", body: msgB }) } as any);

    // Fetch A
    const dataA = await (await ChatsIdRoute.loader({ params: { id: chatA.id } } as any)).json();
    // Fetch B
    const dataB = await (await ChatsIdRoute.loader({ params: { id: chatB.id } } as any)).json();

    expect(dataA.chat.messages.map((m: any) => m.content)).toEqual(["Hi from A"]);
    expect(dataB.chat.messages.map((m: any) => m.content)).toEqual(["Hello from B"]);
  });
});
