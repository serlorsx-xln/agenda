import { NextResponse } from "next/server";

import { runBillingMaintenance } from "@/lib/billing/subscription-lifecycle";
import { requireCronSecret } from "@/lib/crypto-secrets";

export const dynamic = "force-dynamic";

/** Daily billing maintenance: expire payments, past_due, downgrade, reminders. */
export async function POST(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runBillingMaintenance();
  return NextResponse.json({ ok: true, ...result });
}
