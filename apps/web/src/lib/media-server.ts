import "server-only";

import { eq, and } from "drizzle-orm";

import { db, mediaAssets } from "@line/db";

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Detect image MIME from magic bytes (not client-supplied type). */
export function detectImageMime(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    data.length >= 6 &&
    (data.subarray(0, 6).toString("ascii") === "GIF87a" ||
      data.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "image/gif";
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export async function insertMediaAsset(input: {
  userId: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}): Promise<{ id: string; fileName: string; mimeType: string; byteSize: number }> {
  const detected = detectImageMime(input.data);
  if (!detected || !isAllowedImageMime(detected)) {
    throw new Error("invalid_mime");
  }
  const mimeType = detected;
  if (input.data.length > MAX_MEDIA_BYTES) {
    throw new Error("file_too_large");
  }
  const [row] = await db
    .insert(mediaAssets)
    .values({
      userId: input.userId,
      fileName: input.fileName,
      mimeType,
      byteSize: input.data.length,
      data: input.data,
    })
    .returning({
      id: mediaAssets.id,
      fileName: mediaAssets.fileName,
      mimeType: mediaAssets.mimeType,
      byteSize: mediaAssets.byteSize,
    });
  if (!row) throw new Error("insert_failed");
  return row;
}

export async function getMediaAssetForUser(
  userId: string,
  assetId: string,
): Promise<{ mimeType: string; data: Buffer } | null> {
  const [row] = await db
    .select({
      mimeType: mediaAssets.mimeType,
      data: mediaAssets.data,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function deleteMediaAssetForUser(
  userId: string,
  assetId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .returning({ id: mediaAssets.id });
  return deleted.length > 0;
}
