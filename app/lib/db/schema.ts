import { pgTable, text, timestamp, json } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

// Chat conversation
export const chats = pgTable("chats", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  title: text("title"),
  sandboxId: text("sandbox_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Individual message in a chat
export const messages = pgTable("messages", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  chatId: text("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  previewUrl: text("preview_url"),
  thinkingSteps: json("thinking_steps"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Generated files/artifacts
export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  chatId: text("chat_id").notNull(),
  filename: text("filename").notNull(),
  content: text("content").notNull(),
  previewUrl: text("preview_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Types
export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
