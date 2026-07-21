import { describe, it, expect, vi } from "vitest";
import { formatChatHistoryForPrompt, loadChatHistory, withoutLatestPersistedUserTurn } from "../../app/lib/chat-history";

const sampleMessages = [
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi there" },
];

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({ orderBy: async () => sampleMessages }),
    }),
  }),
};

describe("loadChatHistory", () => {
  it("maps DB rows to pi messages", async () => {
    const history = await loadChatHistory("chat-1", { dbClient: fakeDb as any });

    expect(history.length).toBe(2);
    expect(history[0].role).toBe("user");
    expect(history[1].role).toBe("assistant");
    expect(history[0].content).toBe("Hello");
    expect(history[1].content).toEqual([{ type: "text", text: "Hi there" }]);
  });

  it("returns empty array when there are no messages", async () => {
    const emptyDb = {
      select: () => ({
        from: () => ({
          where: () => ({ orderBy: async () => [] }),
        }),
      }),
    };

    const history = await loadChatHistory("chat-empty", { dbClient: emptyDb as any });
    expect(history).toEqual([]);
  });

  it("treats unknown roles as assistant fallback", async () => {
    const dbWithUnknown = {
      select: () => ({
        from: () => ({
          where: () => ({ orderBy: async () => [{ role: "system", content: "note" }] }),
        }),
      }),
    };

    const history = await loadChatHistory("chat-unknown", { dbClient: dbWithUnknown as any });
    expect(history.length).toBe(1);
    expect(history[0].role).toBe("assistant");
    expect(history[0].content).toEqual([{ type: "text", text: "note" }]);
  });

  it("passes chatId through to DB where clause", async () => {
    const whereSpy = vi.fn().mockResolvedValue(sampleMessages);
    const dbSpy = {
      select: () => ({
        from: () => ({
          where: (query: unknown) => {
            whereSpy(query);
            return { orderBy: async () => sampleMessages };
          },
        }),
      }),
    };

    await loadChatHistory("chat-123", { dbClient: dbSpy as any });

    expect(whereSpy).toHaveBeenCalledTimes(1);
    const [[queryArg]] = whereSpy.mock.calls;
    expect(queryArg).toBeDefined();
  });

  it("loads different histories when switching chats", async () => {
    const loadMessages = vi.fn(async (chatId: string) => {
      if (chatId === "chat-A") {
        return [{ role: "user", content: "Hi A" }];
      }
      if (chatId === "chat-B") {
        return [{ role: "assistant", content: "Hello from B" }];
      }
      return [];
    });

    const historyA = await loadChatHistory("chat-A", { loadMessages });
    const historyB = await loadChatHistory("chat-B", { loadMessages });

    expect(historyA.length).toBe(1);
    expect(historyA[0].role).toBe("user");
    expect(historyA[0].content).toBe("Hi A");

    expect(historyB.length).toBe(1);
    expect(historyB[0].role).toBe("assistant");
    expect(historyB[0].content).toEqual([{ type: "text", text: "Hello from B" }]);

    expect(loadMessages).toHaveBeenCalledTimes(2);
    expect(loadMessages).toHaveBeenNthCalledWith(1, "chat-A");
    expect(loadMessages).toHaveBeenNthCalledWith(2, "chat-B");
  });

  it("formats persisted turns as explicit model context", async () => {
    const history = await loadChatHistory("chat-1", { dbClient: fakeDb as any });

    expect(formatChatHistoryForPrompt(history)).toBe(
      "Conversation history:\nUser: Hello\n\nAssistant: Hi there",
    );
  });

  it("excludes only the current persisted user turn from model history", async () => {
    const history = await loadChatHistory("chat-1", {
      loadMessages: async () => [
        { role: "user", content: "Previous question" },
        { role: "assistant", content: "Previous answer" },
        { role: "user", content: "Current question" },
      ],
    });

    const context = formatChatHistoryForPrompt(withoutLatestPersistedUserTurn(history, true));
    expect(context).toContain("Previous question");
    expect(context).toContain("Previous answer");
    expect(context).not.toContain("Current question");
    expect(withoutLatestPersistedUserTurn(history, false)).toHaveLength(3);
  });
});
