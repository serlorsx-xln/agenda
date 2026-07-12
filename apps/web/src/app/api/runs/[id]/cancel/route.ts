import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { getRun } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { workerFetch, WorkerError } from "@/lib/worker";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await getRun(session.user.id, id);
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await workerFetch(`/runs/${id}/cancel`, { method: "POST" }, session.user.id);
    await recordAudit(session.user.id, "run.cancel", {
      targetType: "run",
      targetId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof WorkerError ? err.status : 502;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Worker error" },
      { status },
    );
  }
}
