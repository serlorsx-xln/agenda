ALTER TABLE "campaigns" ADD COLUMN "per_chat_cooldown_sec" integer DEFAULT 1800 NOT NULL;
ALTER TABLE "campaign_targets" ADD COLUMN "last_sent_at" timestamp with time zone;
ALTER TABLE "line_connection" ADD COLUMN "last_campaign_send_at" timestamp with time zone;
