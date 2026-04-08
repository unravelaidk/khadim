import type { Message } from "@mariozechner/pi-ai";
import { db, messages } from "./db";
import { eq } from "drizzle-orm";

type DbClient = {
  select: () => {
    from: (table: unknown) => {
      where: (query: unknown) => Promise<Array<{ role: string; content: string }>>;
    };
  };
};

type MessageLoader = (chatId: string) => Promise<Array<{ role: string; content: string }>>;

function toAssistantMessage(content: string): Message {
  return {
    role: "assistant",
    content: [{ type: "text", text: content }],
    api: "openai-completions",
    provider: "openai",
    model: "persisted-history",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

export async function loadChatHistory(
  chatId: string,
  options: { dbClient?: DbClient; loadMessages?: MessageLoader } = {}
): Promise<Message[]> {
  const { dbClient = db, loadMessages } = options;

  const dbMessages = loadMessages
    ? await loadMessages(chatId)
    : await dbClient.select().from(messages).where(eq(messages.chatId, chatId));

  return dbMessages.map((m: { role: string; content: string }) => ({
    ...(m.role === "user"
      ? {
          role: "user" as const,
          content: m.content,
          timestamp: Date.now(),
        }
      : toAssistantMessage(m.content)),
  }));
}
