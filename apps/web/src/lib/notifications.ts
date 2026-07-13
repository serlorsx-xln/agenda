import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import {
  auditLog,
  campaignRuns,
  campaigns,
  db,
  subscriptions,
  user,
} from "@line/db";
import { getPlan, isTrialActive, type PlanId } from "@line/shared/plan";

import { sendEmail } from "@/lib/email";
import { createLogger } from "@/lib/logger";
import { formatTHB } from "@/lib/utils";

const log = createLogger("notifications");

function planDisplayName(planId: PlanId): string {
  return getPlan(planId)?.name ?? planId;
}
const TRIAL_NOTIFY_DAYS = [3, 1] as const;

async function wasNotificationSent(
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

async function markNotificationSent(
  userId: string,
  action: string,
  key: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({
    userId,
    action,
    targetType: "user",
    targetId: userId,
    metadata: { key, ...metadata },
  });
}

async function sendTrialEndingEmail(input: {
  email: string;
  name: string;
  daysLeft: number;
  locale?: string;
}): Promise<void> {
  const isTh = (input.locale ?? "th") === "th";
  const subject = isTh
    ? `ทดลอง Growth เหลือ ${input.daysLeft} วัน`
    : `Your Growth trial ends in ${input.daysLeft} day${input.daysLeft === 1 ? "" : "s"}`;
  const html = isTh
    ? `<p>สวัสดี ${input.name},</p><p>ทดลอง Growth ของคุณจะหมดอายุใน ${input.daysLeft} วัน ชำระเงินเพื่อส่งข้อความและตอบอัตโนมัติต่อ</p>`
    : `<p>Hi ${input.name},</p><p>Your Growth trial ends in ${input.daysLeft} day${input.daysLeft === 1 ? "" : "s"}. Pay to keep sending and auto-reply running.</p>`;

  await sendEmail({ to: input.email, subject, html });
}

export async function sendPaymentReceiptEmail(input: {
  email: string;
  name: string;
  plan: PlanId;
  amountSatang: number;
  locale?: string;
}): Promise<void> {
  const isTh = (input.locale ?? "th") === "th";
  const amount = formatTHB(input.amountSatang / 100);
  const planName = planDisplayName(input.plan);
  const subject = isTh ? "ใบเสร็จการชำระเงิน" : "Payment receipt";
  const html = isTh
    ? `<p>สวัสดี ${input.name},</p><p>เราได้รับการชำระเงิน ${amount} สำหรับแพ็กเกจ ${planName} แล้ว ขอบคุณที่ใช้บริการ</p>`
    : `<p>Hi ${input.name},</p><p>We received your payment of ${amount} for the ${planName} plan. Thank you.</p>`;

  await sendEmail({ to: input.email, subject, html });
}

export async function sendSubscriptionReminderEmail(input: {
  email: string;
  name: string;
  plan: PlanId;
  kind: "renew_7d" | "renew_1d" | "past_due";
  locale?: string;
}): Promise<void> {
  const isTh = (input.locale ?? "th") === "th";
  const planName = planDisplayName(input.plan);
  const subjects = {
    renew_7d: isTh
      ? `แพ็ก ${planName} จะหมดใน 7 วัน`
      : `Your ${planName} plan renews in 7 days`,
    renew_1d: isTh
      ? `แพ็ก ${planName} จะหมดพรุ่งนี้`
      : `Your ${planName} plan ends tomorrow`,
    past_due: isTh
      ? `แพ็ก ${planName} เกินกำหนดชำระ`
      : `Your ${planName} plan is past due`,
  } as const;
  const bodies = {
    renew_7d: isTh
      ? `<p>สวัสดี ${input.name},</p><p>แพ็ก ${planName} จะหมดอายุใน 7 วัน กรุณาชำระเงินใหม่ในหน้าการชำระเงินเพื่อใช้งานต่อ</p>`
      : `<p>Hi ${input.name},</p><p>Your ${planName} plan ends in 7 days. Renew from the Billing page to keep access.</p>`,
    renew_1d: isTh
      ? `<p>สวัสดี ${input.name},</p><p>แพ็ก ${planName} จะหมดอายุพรุ่งนี้ กรุณาชำระเงินใหม่ในหน้าการชำระเงิน</p>`
      : `<p>Hi ${input.name},</p><p>Your ${planName} plan ends tomorrow. Renew from the Billing page.</p>`,
    past_due: isTh
      ? `<p>สวัสดี ${input.name},</p><p>แพ็ก ${planName} เกินกำหนดแล้ว มีช่วงเวลาผ่อนผันอีกไม่กี่วันก่อนระบบจะหยุดการส่งและตอบอัตโนมัติ</p>`
      : `<p>Hi ${input.name},</p><p>Your ${planName} plan is past due. You have a short grace period before sending and auto-reply stop.</p>`,
  } as const;

  await sendEmail({
    to: input.email,
    subject: subjects[input.kind],
    html: bodies[input.kind],
  });
}

async function sendRunFailedEmail(input: {
  email: string;
  name: string;
  campaignName: string;
  runId: string;
  error?: string | null;
  locale?: string;
}): Promise<void> {
  const isTh = (input.locale ?? "th") === "th";
  const subject = isTh ? "การส่งล้มเหลว" : "Send schedule failed";
  const detail = input.error ? `<p>${input.error}</p>` : "";
  const html = isTh
    ? `<p>สวัสดี ${input.name},</p><p>ตารางส่ง "${input.campaignName}" ล้มเหลว</p>${detail}<p>รหัสรายการ: ${input.runId}</p>`
    : `<p>Hi ${input.name},</p><p>Your send schedule "${input.campaignName}" failed.</p>${detail}<p>Reference: ${input.runId}</p>`;

  await sendEmail({ to: input.email, subject, html });
}

/** Scan active trials and send reminder emails (idempotent via audit log). */
export async function processTrialEndingNotifications(): Promise<number> {
  const now = new Date();
  let sent = 0;

  const rows = await db
    .select({
      userId: subscriptions.userId,
      trialEndsAt: subscriptions.trialEndsAt,
      plan: subscriptions.plan,
      status: subscriptions.status,
      email: user.email,
      name: user.name,
      locale: user.locale,
    })
    .from(subscriptions)
    .innerJoin(user, eq(subscriptions.userId, user.id))
    .where(
      and(
        eq(subscriptions.plan, "free"),
        sql`${subscriptions.trialEndsAt} IS NOT NULL`,
        gte(subscriptions.trialEndsAt, now),
      ),
    );

  for (const row of rows) {
    const snapshot = {
      plan: row.plan as PlanId,
      status: row.status,
      trialEndsAt: row.trialEndsAt,
    };
    if (!isTrialActive(snapshot) || !row.trialEndsAt) continue;

    const daysLeft = Math.ceil(
      (row.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (!(TRIAL_NOTIFY_DAYS as readonly number[]).includes(daysLeft)) continue;

    const dedupeKey = `trial-ending:${daysLeft}`;
    if (await wasNotificationSent(row.userId, "notification.trial_ending", dedupeKey)) {
      continue;
    }

    try {
      await sendTrialEndingEmail({
        email: row.email,
        name: row.name,
        daysLeft,
        locale: row.locale,
      });
      await markNotificationSent(
        row.userId,
        "notification.trial_ending",
        dedupeKey,
        { daysLeft },
      );
      sent += 1;
    } catch (err) {
      log.error("trial ending email failed", {
        userId: row.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return sent;
}

/** Notify users about failed runs finished in the last hour (idempotent). */
export async function processRunFailedNotifications(): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  let sent = 0;

  const rows = await db
    .select({
      runId: campaignRuns.id,
      userId: campaignRuns.userId,
      campaignName: campaigns.name,
      error: campaignRuns.error,
      email: user.email,
      name: user.name,
      locale: user.locale,
    })
    .from(campaignRuns)
    .innerJoin(campaigns, eq(campaigns.id, campaignRuns.campaignId))
    .innerJoin(user, eq(user.id, campaignRuns.userId))
    .where(
      and(
        eq(campaignRuns.status, "failed"),
        gte(campaignRuns.finishedAt, since),
      ),
    );

  for (const row of rows) {
    const dedupeKey = `run-failed:${row.runId}`;
    if (
      await wasNotificationSent(
        row.userId,
        "notification.run_failed",
        dedupeKey,
      )
    ) {
      continue;
    }

    try {
      await sendRunFailedEmail({
        email: row.email,
        name: row.name,
        campaignName: row.campaignName,
        runId: row.runId,
        error: row.error,
        locale: row.locale,
      });
      await markNotificationSent(
        row.userId,
        "notification.run_failed",
        dedupeKey,
        { runId: row.runId },
      );
      sent += 1;
    } catch (err) {
      log.error("run failed email failed", {
        userId: row.userId,
        runId: row.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return sent;
}
