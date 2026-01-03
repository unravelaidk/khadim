CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"filename" text NOT NULL,
	"content" text NOT NULL,
	"preview_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"sandbox_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"preview_url" text,
	"thinking_steps" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;