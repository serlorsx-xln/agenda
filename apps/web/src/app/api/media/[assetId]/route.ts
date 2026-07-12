import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import {
  deleteMediaAssetForUser,
  getMediaAssetForUser,
} from "@/lib/media-server";
import { getSession } from "@/lib/session";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  const asset = await getMediaAssetForUser(session.user.id, assetId);
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  const deleted = await deleteMediaAssetForUser(session.user.id, assetId);
  if (!deleted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await recordAudit(session.user.id, "media.delete", {
    targetType: "media_asset",
    targetId: assetId,
  });

  return NextResponse.json({ ok: true });
}
