ALTER TABLE "campaigns" ADD COLUMN "send_rotation_index" integer DEFAULT 0 NOT NULL;
ALTER TABLE "campaigns" ADD COLUMN "next_send_at" timestamp with time zone;
ALTER TABLE "campaigns" ADD COLUMN "daily_run_id" uuid;
ALTER TABLE "campaigns" ADD COLUMN "rate_limit_streak" integer DEFAULT 0 NOT NULL;

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_daily_run_id_campaign_runs_id_fk"
  FOREIGN KEY ("daily_run_id") REFERENCES "public"."campaign_runs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE "campaign_daily_sends" (
  "campaign_id" uuid NOT NULL,
  "stat_date" date NOT NULL,
  "chat_mid" text NOT NULL,
  "send_count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "campaign_daily_sends_campaign_id_campaigns_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "campaign_daily_sends_pkey" PRIMARY KEY ("campaign_id","stat_date","chat_mid")
);

CREATE INDEX "campaign_daily_sends_campaign_date_idx"
  ON "campaign_daily_sends" USING btree ("campaign_id","stat_date");
