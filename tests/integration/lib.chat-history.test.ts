import { describe, it, expect, vi } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { loadChatHistory } from "../../app/lib/chat-history";

const sampleMessages = [
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi there" },
];

const fakeDb = {
  select: () => ({
    from: () => ({
      where: async () => sampleMessages,
    }),
  }),
};

describe("loadChatHistory", () => {
  it("maps DB rows to LangChain messages", async () => {
    const history = await loadChatHistory("chat-1", { dbClient: fakeDb as any });

    expect(history.length).toBe(2);
    expect(history[0] instanceof HumanMessage).toBe(true);
    expect(history[1] instanceof AIMessage).toBe(true);
    expect(history[0].content).toBe("Hello");
    expect(history[1].content).toBe("Hi there");
  });

  it("returns empty array when there are no messages", async () => {
    const emptyDb = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const history = await loadChatHistory("chat-empty", { dbClient: emptyDb as any });
    expect(history).toEqual([]);
  });

  it("treats unknown roles as AIMessage fallback", async () => {
    const dbWithUnknown = {
      select: () => ({
        from: () => ({
          where: async () => [{ role: "system", content: "note" }],
        }),
      }),
    };

    const history = await loadChatHistory("chat-unknown", { dbClient: dbWithUnknown as any });
    expect(history.length).toBe(1);
    expect(history[0] instanceof AIMessage).toBe(true);
    expect(history[0].content).toBe("note");
  });

  it("passes chatId through to DB where clause", async () => {
    const whereSpy = vi.fn().mockResolvedValue(sampleMessages);
    const dbSpy = {
      select: () => ({
        from: () => ({
          where: whereSpy,
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
    expect(historyA[0] instanceof HumanMessage).toBe(true);
    expect(historyA[0].content).toBe("Hi A");

    expect(historyB.length).toBe(1);
    expect(historyB[0] instanceof AIMessage).toBe(true);
    expect(historyB[0].content).toBe("Hello from B");

    expect(loadMessages).toHaveBeenCalledTimes(2);
    expect(loadMessages).toHaveBeenNthCalledWith(1, "chat-A");
    expect(loadMessages).toHaveBeenNthCalledWith(2, "chat-B");
  });
});
