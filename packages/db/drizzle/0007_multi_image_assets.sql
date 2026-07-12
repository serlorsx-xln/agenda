ALTER TABLE "templates" ADD COLUMN "image_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD COLUMN "reply_image_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
