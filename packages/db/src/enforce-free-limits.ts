import { eq, sql } from "drizzle-orm";

import { db } from "./client";
import { autoReplyRules, campaigns } from "./schema";

/**
 * When trial expires without payment, pause all campaigns and disable auto-reply.
 * Idempotent - safe to run on every dashboard load or daily cron.
 */
export async function enforceLockedPlanLimits(userId: string): Promise<void> {
  const now = new Date();

  await db
    .update(campaigns)
    .set({ status: "paused", enabled: false, updatedAt: now })
    .where(eq(campaigns.userId, userId));

  await db
    .update(autoReplyRules)
    .set({ enabled: false, updatedAt: now })
    .where(eq(autoReplyRules.userId, userId));
}

export async function countAutoReplyRules(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autoReplyRules)
    .where(eq(autoReplyRules.userId, userId));
  return row?.count ?? 0;
}
