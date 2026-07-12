import { and, eq, isNotNull, lt } from "drizzle-orm";

import { db, enforceLockedPlanLimits, subscriptions } from "@line/db";

import { syncAutoReplyListener } from "../line/auto-reply.js";

async function enforceTrialExpiryForUser(userId: string): Promise<void> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!sub?.trialEndsAt) return;
  if (sub.trialEndsAt.getTime() > Date.now()) return;
  if (sub.plan !== "free") return;

  await enforceLockedPlanLimits(userId);
  await syncAutoReplyListener(userId);
}

/** Process all users whose trial has ended. Called daily from the worker daemon. */
export async function runTrialExpiryJob(): Promise<void> {
  const now = new Date();
  const rows = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(
      and(
        isNotNull(subscriptions.trialEndsAt),
        lt(subscriptions.trialEndsAt, now),
        eq(subscriptions.plan, "free"),
      ),
    );

  for (const { userId } of rows) {
    try {
      await enforceTrialExpiryForUser(userId);
    } catch (err) {
      console.warn(`[trial-expiry] failed for user ${userId}:`, err);
    }
  }
}
