ALTER TABLE "subscriptions" ADD COLUMN "trial_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "line_connection_mid_unique" ON "line_connection" USING btree ("mid") WHERE "line_connection"."mid" IS NOT NULL;
