"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, payments } from "@line/db";

import { recordAudit } from "@/lib/audit";
import { ensureUserResources, getSubscription } from "@/lib/db-helpers";
import { getPlan, type PaidPlanId } from "@/lib/plans";
import {
  buildPromptPayPayload,
  newPaymentReference,
  paymentTtlMinutes,
} from "@/lib/promptpay";
import { requireUser } from "@/lib/session";
import { thbToSatang } from "@/lib/utils";

export type PromptPayIntent = {
  ok: boolean;
  error?: string;
  paymentId?: string;
  qrPayload?: string;
  reference?: string;
  amount?: number;
  expiresAt?: string;
};

/**
 * Create a PENDING PromptPay payment. Amount stored in satang; QR uses whole baht.
 * Supersedes any other pending payments for the same user.
 */
export async function createPromptPayIntent(
  planId: PaidPlanId,
): Promise<PromptPayIntent> {
  const user = await requireUser();
  const plan = getPlan(planId);
  if (!plan || plan.monthlyAmount <= 0) {
    return { ok: false, error: "invalid_plan" };
  }

  if (!process.env.PROMPTPAY_ID || process.env.PROMPTPAY_ID === "0000000000") {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "provider_not_configured" };
    }
  }

  await ensureUserResources(user.id);
  const subscription = await getSubscription(user.id);

  // Supersede existing pending payments.
  await db
    .update(payments)
    .set({ status: "expired", failureReason: "superseded" })
    .where(
      and(eq(payments.userId, user.id), inArray(payments.status, ["pending"])),
    );

  const reference = newPaymentReference();
  const amountBaht = plan.monthlyAmount;
  const amountSatang = thbToSatang(amountBaht);
  const qrPayload = buildPromptPayPayload(amountBaht);
  const expiresAt = new Date(Date.now() + paymentTtlMinutes() * 60_000);

  const [row] = await db
    .insert(payments)
    .values({
      userId: user.id,
      subscriptionId: subscription?.id ?? null,
      plan: planId,
      amount: amountSatang,
      currency: "THB",
      status: "pending",
      promptpayRef: reference,
      qrPayload,
      expiresAt,
    })
    .returning({ id: payments.id });

  await recordAudit(user.id, "billing.intent.create", {
    targetType: "payment",
    targetId: row?.id,
    metadata: { plan: planId, amountSatang, amountBaht },
  });

  revalidatePath("/dashboard/billing");
  return {
    ok: true,
    paymentId: row?.id,
    qrPayload,
    reference,
    amount: amountBaht,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function cancelPendingPayment(
  paymentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const [row] = await db
    .update(payments)
    .set({ status: "expired", failureReason: "cancelled_by_user" })
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.userId, user.id),
        eq(payments.status, "pending"),
      ),
    )
    .returning({ id: payments.id });

  if (!row) return { ok: false, error: "not_pending" };

  await recordAudit(user.id, "billing.intent.cancel", {
    targetType: "payment",
    targetId: paymentId,
  });

  revalidatePath("/dashboard/billing");
  return { ok: true };
}
