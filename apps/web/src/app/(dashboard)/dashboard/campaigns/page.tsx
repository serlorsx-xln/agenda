import { getTranslations } from "next-intl/server";

import { CampaignsClient } from "@/components/campaigns/campaigns-client";
import { PageHeader } from "@/components/dashboard/page-header";
import { getPlanUsage } from "@/lib/plan-limits";
import { getCampaignsWithProgress } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function CampaignsPage() {
  const user = await requireUser();
  const t = await getTranslations("campaigns");
  const campaigns = await getCampaignsWithProgress(user.id);
  const planUsage = await getPlanUsage(user.id);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <CampaignsClient
        planUsage={planUsage}
        campaigns={campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          enabled: c.enabled,
          targetCount: c.targetCount,
          maxSends: c.maxSends,
          sentToday: c.sentToday,
          nextTargetName: c.nextTargetName,
          dailyRunId: c.dailyRunId,
          withinWindow: c.withinWindow,
          dailyLimitReached: c.dailyLimitReached,
        }))}
      />
    </div>
  );
}
