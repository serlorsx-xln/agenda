import "server-only";

import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";

import { auditLog, db, payments, subscriptions, user } from "@line/db";
import { PAID_PLAN_IDS } from "@line/shared";

import { sendSubscriptionReminderEmail } from "@/lib/notifications";
import { paymentGraceMinutes } from "@/lib/promptpay";

function subscriptionGraceDays(): number {
  return Number(process.env.SUBSCRIPTION_GRACE_DAYS ?? 3);
}

async function wasSent(
  userId: string,
  action: string,
  key: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.userId, userId),
        eq(auditLog.action, action),
        sql`${auditLog.metadata}->>'key' = ${key}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function markSent(
  userId: string,
  action: string,
  key: string,
): Promise<void> {
  await db.insert(auditLog).values({
    userId,
    action,
    targetType: "user",
    targetId: userId,
    metadata: { key },
  });
}

/** Expire pending payments past TTL + grace. */
async function expirePendingPayments(): Promise<number> {
  const graceMs = paymentGraceMinutes() * 60_000;
  const cutoff = new Date(Date.now() - graceMs);
  const rows = await db
    .update(payments)
    .set({ status: "expired", failureReason: "expired" })
    .where(
      and(
        eq(payments.status, "pending"),
        isNotNull(payments.expiresAt),
        lt(payments.expiresAt, cutoff),
      ),
    )
    .returning({ id: payments.id });
  return rows.length;
}

/**
 * Move active paid subscriptions past period end into past_due,
 * then free after grace days.
 */
async function expireDueSubscriptions(): Promise<{
  pastDue: number;
  free: number;
}> {
  const now = new Date();
  const graceDays = subscriptionGraceDays();
  const graceCutoff = new Date(
    now.getTime() - graceDays * 24 * 60 * 60 * 1000,
  );

  const pastDueRows = await db
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: now })
    .where(
      and(
        eq(subscriptions.status, "active"),
        inArray(subscriptions.plan, [...PAID_PLAN_IDS]),
        isNotNull(subscriptions.currentPeriodEnd),
        lt(subscriptions.currentPeriodEnd, now),
        gte(subscriptions.currentPeriodEnd, graceCutoff),
      ),
    )
    .returning({ id: subscriptions.id });

  const freeRows = await db
    .update(subscriptions)
    .set({
      plan: "free",
      status: "inactive",
      updatedAt: now,
    })
    .where(
      and(
        inArray(subscriptions.status, ["active", "past_due"]),
        inArray(subscriptions.plan, [...PAID_PLAN_IDS]),
        isNotNull(subscriptions.currentPeriodEnd),
        lt(subscriptions.currentPeriodEnd, graceCutoff),
      ),
    )
    .returning({ id: subscriptions.id });

  return { pastDue: pastDueRows.length, free: freeRows.length };
}

/** Send renewal / past_due reminders (7d, 1d, past_due day 1). */
async function processSubscriptionReminders(): Promise<number> {
  const now = new Date();
  let sent = 0;

  const rows = await db
    .select({
      userId: subscriptions.userId,
      plan: subscriptions.plan,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      email: user.email,
      name: user.name,
      locale: user.locale,
    })
    .from(subscriptions)
    .innerJoin(user, eq(subscriptions.userId, user.id))
    .where(
      and(
        inArray(subscriptions.plan, [...PAID_PLAN_IDS]),
        inArray(subscriptions.status, ["active", "past_due"]),
        isNotNull(subscriptions.currentPeriodEnd),
      ),
    );

  for (const row of rows) {
    if (!row.currentPeriodEnd) continue;
    const end = row.currentPeriodEnd.getTime();
    const daysToEnd = Math.ceil((end - now.getTime()) / (24 * 60 * 60 * 1000));
    const daysPast = Math.ceil((now.getTime() - end) / (24 * 60 * 60 * 1000));

    let kind: "renew_7d" | "renew_1d" | "past_due" | null = null;
    if (row.status === "active" && daysToEnd === 7) kind = "renew_7d";
    else if (row.status === "active" && daysToEnd === 1) kind = "renew_1d";
    else if (row.status === "past_due" && daysPast === 1) kind = "past_due";
    if (!kind) continue;

    const periodKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(row.currentPeriodEnd);
    const dedupeKey = `${kind}:${periodKey}`;
    if (await wasSent(row.userId, "notification.subscription", dedupeKey)) {
      continue;
    }

    try {
      await sendSubscriptionReminderEmail({
        email: row.email,
        name: row.name,
        plan: row.plan,
        kind,
        locale: row.locale,
      });
      await markSent(row.userId, "notification.subscription", dedupeKey);
      sent += 1;
    } catch {
      // non-fatal
    }
  }

  return sent;
}

/** Run all billing maintenance steps. */
export async function runBillingMaintenance(): Promise<{
  expiredPayments: number;
  pastDue: number;
  free: number;
  reminders: number;
}> {
  const expiredPayments = await expirePendingPayments();
  const { pastDue, free } = await expireDueSubscriptions();
  const reminders = await processSubscriptionReminders();
  return { expiredPayments, pastDue, free, reminders };
}
