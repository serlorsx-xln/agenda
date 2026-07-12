-- Backfill arrays from legacy single-image columns, then drop them.
UPDATE "templates"
SET "image_asset_ids" = jsonb_build_array("image_asset_id")
WHERE "image_asset_id" IS NOT NULL
  AND ("image_asset_ids" IS NULL OR "image_asset_ids" = '[]'::jsonb);
--> statement-breakpoint
UPDATE "auto_reply_rules"
SET "reply_image_asset_ids" = jsonb_build_array("reply_image_asset_id")
WHERE "reply_image_asset_id" IS NOT NULL
  AND ("reply_image_asset_ids" IS NULL OR "reply_image_asset_ids" = '[]'::jsonb);
--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "image_asset_id";
--> statement-breakpoint
ALTER TABLE "auto_reply_rules" DROP COLUMN "reply_image_asset_id";
