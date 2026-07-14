import { getTranslations } from "next-intl/server";

import { CampaignsClient } from "@/components/campaigns/campaigns-client";
import { PageHeader } from "@/components/dashboard/page-header";
import { getPlanUsage } from "@/lib/plan-limits";
import {
  getCampaigns,
  getCampaignsWithProgress,
  getCampaignTargetsByUser,
  getChats,
  getTemplates,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string }>;
}) {
  const user = await requireUser();
  const t = await getTranslations("campaigns");
  const params = await searchParams;

  const [campaigns, planUsage, templates, chats, allCampaigns, targetsMap] =
    await Promise.all([
      getCampaignsWithProgress(user.id),
      getPlanUsage(user.id),
      getTemplates(user.id),
      getChats(user.id),
      getCampaigns(user.id),
      getCampaignTargetsByUser(user.id),
    ]);

  const editorById: Record<
    string,
    {
      id: string;
      name: string;
      templateId: string | null;
      timezone: string;
      windowStartHour: number;
      windowEndHour: number;
      cronExpr: string | null;
      maxSends: number;
      delayBetweenTargetsSec: number;
      perChatCooldownSec: number;
      randomJitterSec: number;
      autoStopOnErrors: number;
      enabled: boolean;
    }
  > = {};
  for (const c of allCampaigns) {
    editorById[c.id] = {
      id: c.id,
      name: c.name,
      templateId: c.templateId,
      timezone: c.timezone,
      windowStartHour: c.windowStartHour,
      windowEndHour: c.windowEndHour,
      cronExpr: c.cronExpr,
      maxSends: c.maxSends,
      delayBetweenTargetsSec: c.delayBetweenTargetsSec,
      perChatCooldownSec: c.perChatCooldownSec,
      randomJitterSec: c.randomJitterSec,
      autoStopOnErrors: c.autoStopOnErrors,
      enabled: c.enabled,
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <CampaignsClient
        planUsage={planUsage}
        templates={templates.map((tpl) => ({
          id: tpl.id,
          name: tpl.name,
          body: tpl.body,
          imageAssetIds: tpl.imageAssetIds,
        }))}
        chats={chats.map((c) => ({
          chatMid: c.chatMid,
          name: c.name,
          kind: c.kind,
          present: c.present,
        }))}
        editorById={editorById}
        targetsByCampaignId={targetsMap}
        openNewOnMount={params.new === "1"}
        editIdOnMount={params.edit ?? null}
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
