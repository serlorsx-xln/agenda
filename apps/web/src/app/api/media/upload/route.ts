import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { insertMediaAsset, MAX_MEDIA_BYTES } from "@/lib/media-server";
import { assertCanUploadMedia } from "@/lib/plan-limits";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await assertCanUploadMedia(session.user.id);
  if (!limit.ok) {
    return NextResponse.json({ error: limit.error }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  try {
    const asset = await insertMediaAsset({
      userId: session.user.id,
      fileName: file.name || "upload.jpg",
      mimeType: file.type || "image/jpeg",
      data: bytes,
    });
    await recordAudit(session.user.id, "media.upload", {
      targetType: "media_asset",
      targetId: asset.id,
    });
    return NextResponse.json(asset);
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
