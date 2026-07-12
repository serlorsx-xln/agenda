import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, payments } from "@line/db";

import { recordAudit } from "@/lib/audit";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: paymentId } = await context.params;
  const [row] = await db
    .update(payments)
    .set({ status: "expired", failureReason: "cancelled_by_user" })
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.userId, session.user.id),
        eq(payments.status, "pending"),
      ),
    )
    .returning({ id: payments.id });

  if (!row) {
    return NextResponse.json({ error: "not_pending" }, { status: 400 });
  }

  await recordAudit(session.user.id, "billing.intent.cancel", {
    targetType: "payment",
    targetId: paymentId,
  });

  return NextResponse.json({ ok: true });
}
