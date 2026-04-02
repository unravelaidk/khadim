CREATE TABLE IF NOT EXISTS "uploaded_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text,
	"workspace_id" text,
	"filename" text NOT NULL,
	"mime_type" text,
	"size" integer NOT NULL,
	"storage_path" text NOT NULL,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"extracted_text" text,
	"page_count" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uploaded_documents_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "uploaded_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action
);
