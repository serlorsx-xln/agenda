import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CampaignEditor } from "@/components/campaigns/campaign-editor";
import { PageHeader } from "@/components/dashboard/page-header";
import { getPlanUsage } from "@/lib/plan-limits";
import {
  getCampaign,
  getCampaignProgress,
  getCampaignTargets,
  getChats,
  getTemplates,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const t = await getTranslations("campaigns");

  const campaign = await getCampaign(user.id, id);
  if (!campaign) notFound();

  const [templates, chats, targets, planUsage, runProgress] = await Promise.all([
    getTemplates(user.id),
    getChats(user.id),
    getCampaignTargets(id),
    getPlanUsage(user.id),
    getCampaignProgress(user.id, id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("edit")} subtitle={campaign.name} />
      <CampaignEditor
        planUsage={planUsage}
        initial={{
          id: campaign.id,
          name: campaign.name,
          templateId: campaign.templateId,
          timezone: campaign.timezone,
          windowStartHour: campaign.windowStartHour,
          windowEndHour: campaign.windowEndHour,
          cronExpr: campaign.cronExpr,
          maxSends: campaign.maxSends,
          delayBetweenTargetsSec: campaign.delayBetweenTargetsSec,
          randomJitterSec: campaign.randomJitterSec,
          autoStopOnErrors: campaign.autoStopOnErrors,
          enabled: campaign.enabled,
        }}
        initialTargets={targets.map((tg) => tg.chatMid)}
        templates={templates.map((tpl) => ({
          id: tpl.id,
          name: tpl.name,
          body: tpl.body,
          imageAssetIds: tpl.imageAssetIds,
        }))}
        chats={chats.map((c) => ({
          chatMid: c.chatMid,
          name: c.name,
          present: c.present,
        }))}
        runProgress={runProgress}
      />
    </div>
  );
}
