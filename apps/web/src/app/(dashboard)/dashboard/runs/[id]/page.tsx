import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { RunLive } from "@/components/runs/run-live";
import { getCampaign, getRun } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const run = await getRun(user.id, id);
  if (!run) notFound();
  const campaign = await getCampaign(user.id, run.campaignId);

  return (
    <div className="space-y-6">
      <PageHeader title={campaign?.name ?? "Run"} />
      <RunLive runId={id} />
    </div>
  );
}
