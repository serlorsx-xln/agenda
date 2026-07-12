import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, payments } from "@line/db";

import { recordAudit } from "@/lib/audit";
import { confirmPayment } from "@/lib/billing/fulfillment";
import {
  paymentGraceMinutes,
  releaseSlipClaim,
  verifyProviderPayment,
} from "@/lib/promptpay";
import { checkLoginRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIpFromHeaders(request.headers);
  // Reuse login rate-limit bucket key pattern for slip uploads (3-ish/min via 10/15m is ok).
  // Dedicated key prefix keeps sign-in and slip quotas separate.
  if (!(await checkLoginRateLimit(`slip:${session.user.id}:${ip}`))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id: paymentId } = await context.params;
  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(eq(payments.id, paymentId), eq(payments.userId, session.user.id)),
    )
    .limit(1);

  if (!payment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (payment.status !== "pending") {
    return NextResponse.json({ error: "not_pending" }, { status: 400 });
  }

  const graceMs = paymentGraceMinutes() * 60_000;
  const deadline = payment.expiresAt
    ? payment.expiresAt.getTime() + graceMs
    : Date.now() + graceMs;
  if (Date.now() > deadline) {
    await db
      .update(payments)
      .set({ status: "expired", failureReason: "expired" })
      .where(eq(payments.id, paymentId));
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const verification = await verifyProviderPayment({
    payment,
    imageBytes: bytes,
    filename: file.name || "slip.jpg",
  });

  if (!verification.ok) {
    await db
      .update(payments)
      .set({ failureReason: verification.error ?? "verify_failed" })
      .where(eq(payments.id, paymentId));
    return NextResponse.json(
      {
        ok: false,
        error: verification.error,
        params: verification.params,
      },
      { status: 400 },
    );
  }

  const result = await confirmPayment(paymentId, session.user.id, {
    verifiedTran: verification.verifiedTran,
    verifiedRef: verification.verifiedRef,
    receiverMasked: verification.receiverMasked,
  });

  if (!result.ok) {
    await releaseSlipClaim(verification.verifiedTran);
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await recordAudit(session.user.id, "billing.slip.confirm", {
    targetType: "payment",
    targetId: paymentId,
    metadata: { tran: verification.verifiedTran },
  });

  return NextResponse.json({ ok: true, paymentId });
}
