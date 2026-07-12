import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@line/db";

import { requireCronSecret } from "@/lib/crypto-secrets";
import {
  processRunFailedNotifications,
  processTrialEndingNotifications,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Daily notification sweep (trial ending, failed runs). */
export async function POST(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await db.execute(sql`select 1`);
  } catch {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  const [trialEnding, runFailed] = await Promise.all([
    processTrialEndingNotifications(),
    processRunFailedNotifications(),
  ]);

  return NextResponse.json({ ok: true, trialEnding, runFailed });
}
