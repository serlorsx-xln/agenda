import { and, eq } from "drizzle-orm";

import { db, mediaAssets } from "@line/db";

export type LoadedMediaAsset = {
  id: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  byteSize: number;
};

export async function loadMediaAsset(
  userId: string,
  assetId: string,
): Promise<LoadedMediaAsset | null> {
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1);
  if (!row) return null;
  const buffer = Buffer.isBuffer(row.data)
    ? row.data
    : Buffer.from(row.data as unknown as Uint8Array);
  return {
    id: row.id,
    buffer,
    fileName: row.fileName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
  };
}
