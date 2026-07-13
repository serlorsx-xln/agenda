import "server-only";

import generatePayload from "promptpay-qr";

import { verifySlipImage } from "@/lib/billing/scb-slip-client";
import { mapScbReturnCode } from "@/lib/billing/scb-slip-types";
import {
  deleteSlipClaim,
  matchSlipToPayment,
  paymentAmountBaht,
  tryClaimSlipTran,
} from "@/lib/billing/slip-match";
import {
  buildBillPaymentPayload,
  isBillPaymentPromptPayId,
  toBillerId,
} from "@/lib/billing/thai-qr";
import type { Payment } from "@line/db";

const PLACEHOLDER_PROMPTPAY_ID = process.env.PROMPTPAY_ID ?? "0000000000";

export type ProviderVerification = {
  ok: boolean;
  providerRef?: string;
  verifiedTran?: string;
  verifiedRef?: string;
  receiverMasked?: string;
  error?: string;
  params?: Record<string, string | number>;
};

/**
 * Build checkout QR for the configured PromptPay target.
 * Phone / e-wallet → credit-transfer; 13–15 digit biller or PROMPTPAY_TYPE=bill
 * → Mae Manee bill payment QR with locked amount.
 */
export function buildPromptPayPayload(
  amountBaht: number,
  paymentRef?: string,
): string {
  const id = PLACEHOLDER_PROMPTPAY_ID.trim();
  try {
    if (isBillPaymentPromptPayId(id)) {
      const merchant =
        process.env.PROMPTPAY_MERCHANT_NAME?.trim() ||
        process.env.PROMPTPAY_REF2?.trim() ||
        "SLYNX";
      return buildBillPaymentPayload({
        billerId: toBillerId(id),
        amountBaht,
        ref1: paymentRef,
        ref2: merchant,
      });
    }
    return generatePayload(id, { amount: amountBaht });
  } catch {
    return `PLACEHOLDER|${id}|${amountBaht}`;
  }
}

export function newPaymentReference(): string {
  return `PP-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

export function paymentTtlMinutes(): number {
  return Number(process.env.PAYMENT_TTL_MINUTES ?? 30);
}

export function paymentGraceMinutes(): number {
  return Number(process.env.PAYMENT_GRACE_MINUTES ?? 15);
}

/** Verify slip image against a pending payment via slynxslip + business match. */
export async function verifyProviderPayment(input: {
  payment: Payment;
  imageBytes: Buffer;
  filename?: string;
}): Promise<ProviderVerification> {
  const amountBaht = paymentAmountBaht(input.payment);
  let result;
  try {
    result = await verifySlipImage(
      input.imageBytes,
      amountBaht,
      input.filename ?? "slip.jpg",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("TIMEOUT")) return { ok: false, error: "timeout" };
    if (msg.includes("NOT_CONFIGURED")) {
      return { ok: false, error: "provider_not_configured" };
    }
    return { ok: false, error: "upstream_error" };
  }

  const match = await matchSlipToPayment(result, input.payment);
  if (!match.ok) {
    return {
      ok: false,
      error: match.reason,
      params: match.params,
      providerRef: mapScbReturnCode(result.RETURN_CODE),
    };
  }

  const claim = await tryClaimSlipTran(match.tran, input.payment, match.refId);
  if (!claim.ok) {
    return { ok: false, error: claim.reason };
  }

  return {
    ok: true,
    verifiedTran: match.tran,
    verifiedRef: match.refId,
    receiverMasked: match.receiverMasked,
    providerRef: match.tran,
  };
}

export async function releaseSlipClaim(tran: string | undefined): Promise<void> {
  if (tran) await deleteSlipClaim(tran);
}
