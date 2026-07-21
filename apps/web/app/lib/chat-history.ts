import type { Message } from "@mariozechner/pi-ai";
import { db, messages } from "./db";
import { and, asc, eq, ne } from "drizzle-orm";

type DbClient = {
  select: () => {
    from: (table: unknown) => {
      where: (query: unknown) => {
        orderBy: (...queries: unknown[]) => Promise<Array<{ role: string; content: string }>>;
      };
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
  options: { dbClient?: DbClient; loadMessages?: MessageLoader; excludeMessageId?: string } = {}
): Promise<Message[]> {
  const { dbClient = db, loadMessages, excludeMessageId } = options;

  const dbMessages = loadMessages
    ? await loadMessages(chatId)
    : await dbClient.select().from(messages)
      .where(excludeMessageId
        ? and(eq(messages.chatId, chatId), ne(messages.id, excludeMessageId))
        : eq(messages.chatId, chatId))
      .orderBy(asc(messages.createdAt), asc(messages.id));

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

export function formatChatHistoryForPrompt(history: Message[]): string {
  const turns = history.flatMap((message) => {
    const role = message.role === "user" ? "User" : message.role === "assistant" ? "Assistant" : null;
    if (!role) return [];
    const content = typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content
          .map((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : "")
          .filter(Boolean)
          .join("\n")
        : "";
    return content.trim() ? [`${role}: ${content.trim()}`] : [];
  });
  return turns.length > 0 ? `Conversation history:\n${turns.join("\n\n")}` : "";
}

export function withoutLatestPersistedUserTurn(history: Message[], currentTurnPersisted: boolean): Message[] {
  if (!currentTurnPersisted) return history;
  return history.at(-1)?.role === "user" ? history.slice(0, -1) : history;
}
