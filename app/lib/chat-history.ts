import { AIMessage, HumanMessage } from "@langchain/core/messages";
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

export async function loadChatHistory(
  chatId: string,
  options: { dbClient?: DbClient; loadMessages?: MessageLoader } = {}
): Promise<(HumanMessage | AIMessage)[]> {
  const { dbClient = db, loadMessages } = options;

  const dbMessages = loadMessages
    ? await loadMessages(chatId)
    : await dbClient.select().from(messages).where(eq(messages.chatId, chatId));

  return dbMessages.map((m) =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
  );
}
