import "server-only";

import { headers } from "next/headers";

import { auditLog, db } from "@line/db";

export async function recordAudit(
  userId: string | null,
  action: string,
  details?: {
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null;
    await db.insert(auditLog).values({
      userId,
      action,
      targetType: details?.targetType,
      targetId: details?.targetId,
      metadata: details?.metadata,
      ipAddress: ip,
    });
  } catch (err) {
    console.warn("[audit] failed to record:", err);
  }
}
