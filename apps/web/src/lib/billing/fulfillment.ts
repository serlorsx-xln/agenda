import "server-only";

import { and, eq } from "drizzle-orm";

import { db, payments, subscriptions, user } from "@line/db";

import { sendPaymentReceiptEmail } from "@/lib/notifications";

export type ConfirmPaymentResult = { ok: boolean; error?: string };

export type ConfirmPaymentMeta = {
  verifiedTran?: string;
  verifiedRef?: string;
  receiverMasked?: string;
};

function addOneMonth(from: Date): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + 1);
  return end;
}

/**
 * Mark a payment as paid and upgrade the user's subscription.
 * Atomic on payment status=pending to prevent double-fulfill races.
 */
export async function confirmPayment(
  paymentId: string,
  userId?: string,
  meta?: ConfirmPaymentMeta,
): Promise<ConfirmPaymentResult> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!payment) return { ok: false, error: "not_found" };
  if (userId && payment.userId !== userId) {
    return { ok: false, error: "forbidden" };
  }
  if (payment.status === "paid") return { ok: true };

  const now = new Date();
  const periodEnd = addOneMonth(now);

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(payments)
      .set({
        status: "paid",
        paidAt: now,
        verifiedAt: now,
        verifiedTran: meta?.verifiedTran ?? payment.verifiedTran,
        verifiedRef: meta?.verifiedRef ?? payment.verifiedRef,
        slipReceiverMasked:
          meta?.receiverMasked ?? payment.slipReceiverMasked,
        failureReason: null,
      })
      .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")))
      .returning({ id: payments.id });

    if (!row) return null;

    await tx
      .update(subscriptions)
      .set({
        plan: payment.plan,
        status: "active",
        currentPeriodEnd: periodEnd,
        trialStartedAt: null,
        trialEndsAt: null,
        updatedAt: now,
      })
      .where(eq(subscriptions.userId, payment.userId));

    return row;
  });

  if (!updated) {
    const [again] = await db
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (again?.status === "paid") return { ok: true };
    return { ok: false, error: "not_pending" };
  }

  const [account] = await db
    .select({ email: user.email, name: user.name, locale: user.locale })
    .from(user)
    .where(eq(user.id, payment.userId))
    .limit(1);

  if (account) {
    await sendPaymentReceiptEmail({
      email: account.email,
      name: account.name,
      plan: payment.plan,
      amountSatang: payment.amount,
      locale: account.locale,
    }).catch(() => undefined);
  }

  return { ok: true };
}
