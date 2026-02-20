CREATE TABLE "jumbotron_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message" text NOT NULL,
	"type" varchar(30) DEFAULT 'info' NOT NULL,
	"duration_seconds" integer DEFAULT 30 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_scores" ADD COLUMN "display_name" varchar(30);