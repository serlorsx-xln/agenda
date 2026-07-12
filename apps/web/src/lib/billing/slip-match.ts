import "server-only";

import { eq } from "drizzle-orm";

import { db, slipClaims, type Payment } from "@line/db";

import { isSlipFound, type ScbSlipResult } from "@/lib/billing/scb-slip-types";
import {
  receiverMatchesShop,
  shopReceiverIdentifiers,
  slipReceiverDisplayLabel,
} from "@/lib/billing/slip-receiver";

export type SlipMatchResult =
  | { ok: true; tran: string; refId?: string; receiverMasked: string }
  | { ok: false; reason: string; params?: Record<string, string | number> };

function receiverAccount(result: ScbSlipResult): string {
  return result.SLIP_DATA?.RECEIVER_INFO?.ACCT_NUM?.trim() ?? "";
}

function slipAmountBaht(result: ScbSlipResult): number | null {
  const amt = result.SLIP_DATA?.TXN_INFO?.TXN_AMT;
  return typeof amt === "number" && Number.isFinite(amt) ? amt : null;
}

export function paymentAmountBaht(payment: Payment): number {
  return payment.amount / 100;
}

export async function matchSlipToPayment(
  result: ScbSlipResult,
  payment: Payment,
): Promise<SlipMatchResult> {
  if (!isSlipFound(result)) {
    return { ok: false, reason: "not_found" };
  }

  const tran = result.TRAN?.trim() || result.SLIP_DATA?.REF_ID?.trim();
  if (!tran) {
    return { ok: false, reason: "missing_tran" };
  }

  const [existing] = await db
    .select()
    .from(slipClaims)
    .where(eq(slipClaims.tran, tran))
    .limit(1);
  if (existing) {
    return { ok: false, reason: "already_used" };
  }

  const slipAmt = slipAmountBaht(result);
  if (slipAmt == null) {
    return { ok: false, reason: "missing_amount" };
  }

  const expectedPay = paymentAmountBaht(payment);
  if (Math.abs(slipAmt - expectedPay) > 0.001) {
    return {
      ok: false,
      reason: "amount_mismatch",
      params: {
        slip: slipAmt.toFixed(2),
        expected: expectedPay.toFixed(2),
      },
    };
  }

  if (!shopReceiverIdentifiers().length) {
    return { ok: false, reason: "receiver_not_configured" };
  }

  const recvRaw = receiverAccount(result);
  if (!receiverMatchesShop(recvRaw)) {
    return {
      ok: false,
      reason: "receiver_mismatch",
      params: {
        receiver: recvRaw || "—",
        expected: slipReceiverDisplayLabel() || shopReceiverIdentifiers()[0] || "—",
      },
    };
  }

  return {
    ok: true,
    tran,
    refId: result.SLIP_DATA?.REF_ID,
    receiverMasked: recvRaw,
  };
}

export async function tryClaimSlipTran(
  tran: string,
  payment: Payment,
  refId?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await db.insert(slipClaims).values({
      tran,
      paymentId: payment.id,
      userId: payment.userId,
      refId: refId ?? null,
      amountSatang: payment.amount,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return { ok: false, reason: "already_used" };
    }
    return { ok: false, reason: "claim_failed" };
  }
}

export async function deleteSlipClaim(tran: string): Promise<void> {
  await db.delete(slipClaims).where(eq(slipClaims.tran, tran)).catch(() => undefined);
}
