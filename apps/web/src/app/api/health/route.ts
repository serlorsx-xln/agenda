import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@line/db";

import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("health");
const WORKER_URL = process.env.WORKER_LINE_URL ?? "http://localhost:4000";

async function checkWorker(): Promise<boolean> {
  try {
    const res = await fetch(`${WORKER_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body.status === "ok";
  } catch (err) {
    log.warn("worker health check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function GET() {
  let dbOk = false;
  try {
    await db.execute(sql`select 1`);
    dbOk = true;
  } catch {
    // dbOk stays false
  }

  const workerOk = await checkWorker();
  const ok = dbOk && workerOk;

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      db: dbOk,
      worker: workerOk,
    },
    { status: ok ? 200 : 503 },
  );
}
