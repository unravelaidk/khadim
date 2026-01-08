CREATE TABLE "project_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" text,
	"label" text,
	"artifacts" json,
	"project_meta" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"project_type" text,
	"project_name" text,
	"dev_command" text,
	"dev_port" integer DEFAULT 5173,
	"build_dir" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_chat_id_unique" UNIQUE("chat_id")
);
