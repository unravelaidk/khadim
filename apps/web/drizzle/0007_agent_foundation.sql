CREATE TABLE IF NOT EXISTS "agent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text,
	"chat_id" text NOT NULL,
	"dbos_workflow_id" text,
	"prompt" text NOT NULL,
	"mode" text NOT NULL DEFAULT 'build',
	"status" text NOT NULL DEFAULT 'pending',
	"result" text,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_sessions_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action
);
