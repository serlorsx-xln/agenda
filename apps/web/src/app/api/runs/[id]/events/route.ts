import { NextResponse } from "next/server";

import { getRun, getRunEvents } from "@/lib/queries";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
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

  const events = await getRunEvents(id);
  return NextResponse.json({ run, events });
}
