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
    const status = await workerFetch(`/line/${session.user.id}/connect`, {
      method: "POST",
    });
    await recordAudit(session.user.id, "line.connect.start");
    return NextResponse.json(status);
  } catch (err) {
    const status = err instanceof WorkerError ? err.status : 502;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Worker error" },
      { status },
    );
  }
}
