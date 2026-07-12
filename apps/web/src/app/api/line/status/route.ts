import { NextResponse } from "next/server";

import { getConnection } from "@/lib/db-helpers";
import { getSession } from "@/lib/session";
import { workerFetch } from "@/lib/worker";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [status, connection] = await Promise.all([
      workerFetch(`/line/${session.user.id}/status`),
      getConnection(session.user.id),
    ]);
    const worker = status as {
      status: string;
      qrUrl: string | null;
      pin: string | null;
      mid: string | null;
      displayName: string | null;
      lastError: string | null;
      e2eeStatus?: "ok" | "degraded" | "invalid";
    };
    return NextResponse.json({
      ...worker,
      e2eeStatus: worker.e2eeStatus ?? "ok",
      mid: worker.mid ?? connection?.mid ?? null,
      displayName: worker.displayName ?? connection?.displayName ?? null,
    });
  } catch {
    return NextResponse.json({
      status: "disconnected",
      qrUrl: null,
      pin: null,
      mid: null,
      displayName: null,
      lastError: "worker_unreachable",
      e2eeStatus: "ok",
    });
  }
}
