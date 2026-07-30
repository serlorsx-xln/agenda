import { NextResponse } from "next/server";

import { resetNonAdminUsers } from "@line/db/reset-non-admin";

import {
  requireBillingOpsToken,
  requireCronSecret,
} from "@/lib/crypto-secrets";

export const dynamic = "force-dynamic";

/** Ops: wipe all non-admin users and their data. Admin accounts are kept. */
export async function POST(request: Request) {
  if (!requireCronSecret(request) && !requireBillingOpsToken(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await resetNonAdminUsers();
  return NextResponse.json({ ok: true, ...result });
}
