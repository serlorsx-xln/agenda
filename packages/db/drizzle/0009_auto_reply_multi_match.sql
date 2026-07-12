CREATE TYPE "public"."auto_reply_emoji_filter" AS ENUM('any', 'with_emoji', 'without_emoji');--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD COLUMN "chat_mids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD COLUMN "include_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD COLUMN "exclude_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD COLUMN "emoji_filter" "auto_reply_emoji_filter" DEFAULT 'any' NOT NULL;--> statement-breakpoint
UPDATE "auto_reply_rules"
SET
  "chat_mids" = jsonb_build_array("chat_mid"),
  "include_keywords" = jsonb_build_array("keyword"),
  "exclude_keywords" = '[]'::jsonb,
  "emoji_filter" = 'any';--> statement-breakpoint
DROP INDEX IF EXISTS "auto_reply_rules_unique";--> statement-breakpoint
ALTER TABLE "auto_reply_rules" DROP COLUMN "chat_mid";--> statement-breakpoint
ALTER TABLE "auto_reply_rules" DROP COLUMN "keyword";
