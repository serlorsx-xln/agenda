import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { getSession } from "@/lib/session";
import { workerFetch, WorkerError } from "@/lib/worker";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await workerFetch<{ count: number }>(
      `/line/${session.user.id}/sync`,
      { method: "POST" },
    );
    await recordAudit(session.user.id, "line.sync", {
      metadata: { count: result.count },
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof WorkerError ? err.status : 502;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Worker error" },
      { status },
    );
  }
}
