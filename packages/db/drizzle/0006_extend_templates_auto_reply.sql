ALTER TABLE "templates" ADD COLUMN "image_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "body" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_image_asset_id_media_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD COLUMN "reply_image_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD COLUMN "cooldown_sec" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ALTER COLUMN "reply_text" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_reply_image_asset_id_media_assets_id_fk" FOREIGN KEY ("reply_image_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auto_reply_rules_unique" ON "auto_reply_rules" USING btree ("user_id","chat_mid","keyword");
