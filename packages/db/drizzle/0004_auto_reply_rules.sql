CREATE TYPE "public"."auto_reply_match_mode" AS ENUM('contains', 'exact');--> statement-breakpoint
CREATE TABLE "auto_reply_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"chat_mid" text NOT NULL,
	"keyword" text NOT NULL,
	"reply_text" text NOT NULL,
	"match_mode" "auto_reply_match_mode" DEFAULT 'contains' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"last_matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_reply_rules_user_idx" ON "auto_reply_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auto_reply_rules_user_enabled_idx" ON "auto_reply_rules" USING btree ("user_id","enabled");
