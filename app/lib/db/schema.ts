import { pgTable, text, timestamp, json, integer } from "drizzle-orm/pg-core";
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

// Project metadata for proper dev server restoration
export const projects = pgTable("projects", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  chatId: text("chat_id").notNull().unique(),
  projectType: text("project_type"), // "static" | "vite" | "react-router" | "astro" | null
  projectName: text("project_name"), // e.g., "my-app"
  devCommand: text("dev_command"),   // e.g., "npm run dev"
  devPort: integer("dev_port").default(5173),
  buildDir: text("build_dir"),       // e.g., "dist" or "build/client"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});


export const projectVersions = pgTable("project_versions", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  chatId: text("chat_id").notNull(),
  messageId: text("message_id"),   
  label: text("label"),              
  artifacts: json("artifacts"),     
  projectMeta: json("project_meta"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectVersion = typeof projectVersions.$inferSelect;
export type NewProjectVersion = typeof projectVersions.$inferInsert;
