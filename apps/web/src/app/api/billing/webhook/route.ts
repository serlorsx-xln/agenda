import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { confirmPayment } from "@/lib/billing/fulfillment";
import {
  requireBillingWebhookSecret,
  secretsEqual,
} from "@/lib/crypto-secrets";

export const dynamic = "force-dynamic";

const webhookBodySchema = z.object({
  paymentId: z.string().uuid(),
  /** Required ops proof that payment was verified out-of-band (admin tools). */
  opsToken: z.string().min(8),
});

/**
 * Ops-only webhook. Requires BILLING_WEBHOOK_SECRET + opsToken.
 * User-facing fulfill uses slip upload (`/api/billing/payments/[id]/slip`).
 */
export async function POST(request: Request) {
  if (!requireBillingWebhookSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = webhookBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const expectedOps = process.env.BILLING_OPS_TOKEN?.trim();
  if (!expectedOps || !secretsEqual(parsed.data.opsToken, expectedOps)) {
    return NextResponse.json({ error: "ops_forbidden" }, { status: 403 });
  }

  const result = await confirmPayment(parsed.data.paymentId);
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  await recordAudit(null, "billing.webhook.confirm", {
    targetType: "payment",
    targetId: parsed.data.paymentId,
  });

  return NextResponse.json({ ok: true });
}
