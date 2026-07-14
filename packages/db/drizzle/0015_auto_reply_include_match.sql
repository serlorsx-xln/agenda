CREATE TYPE "public"."auto_reply_include_match" AS ENUM('all', 'any');--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD COLUMN "include_match" "auto_reply_include_match" DEFAULT 'all' NOT NULL;
