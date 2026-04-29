import { pgTable, text, timestamp, json, integer, boolean } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

// Persisted workspaces for longer-running agent efforts
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  agentId: text("agent_id").notNull().default("build"),
  sourceChatId: text("source_chat_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workspaceFiles = pgTable("workspace_files", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: text("content").notNull(),
  size: integer("size"),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Chat conversation
export const chats = pgTable("chats", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  title: text("title"),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  sandboxId: text("sandbox_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const uploadedDocuments = pgTable("uploaded_documents", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type"),
  size: integer("size").notNull(),
  storagePath: text("storage_path").notNull(),
  parseStatus: text("parse_status").notNull().default("pending"),
  extractedText: text("extracted_text"),
  pageCount: integer("page_count"),
  error: text("error"),
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
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceFile = typeof workspaceFiles.$inferSelect;
export type NewWorkspaceFile = typeof workspaceFiles.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type UploadedDocument = typeof uploadedDocuments.$inferSelect;
export type NewUploadedDocument = typeof uploadedDocuments.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectVersion = typeof projectVersions.$inferSelect;
export type NewProjectVersion = typeof projectVersions.$inferInsert;

// LLM Model configurations
export const modelConfigs = pgTable("model_configs", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(), // Display name (e.g., "DevStral Free")
  provider: text("provider").notNull(), // "openai" | "anthropic" | "openrouter" | "ollama"
  model: text("model").notNull(), // Model ID (e.g., "mistralai/devstral-2512:free")
  apiKey: text("api_key"), // Optional: can be env var instead
  baseUrl: text("base_url"), // Optional: custom base URL
  temperature: text("temperature").default("0.2"),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ModelConfig = typeof modelConfigs.$inferSelect;
export type NewModelConfig = typeof modelConfigs.$inferInsert;

// Durable agent sessions
export const sessions = pgTable("agent_sessions", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  agentId: text("agent_id"),
  chatId: text("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  mode: text("mode").notNull().default("build"),
  status: text("status").notNull().default("pending"),
  result: text("result"),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
