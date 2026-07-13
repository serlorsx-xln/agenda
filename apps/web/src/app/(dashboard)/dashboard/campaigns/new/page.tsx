import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CampaignEditor } from "@/components/campaigns/campaign-editor";
import { PageHeader } from "@/components/dashboard/page-header";
import { getPlanUsage } from "@/lib/plan-limits";
import { getChats, getTemplates } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function NewCampaignPage() {
  const user = await requireUser();
  const t = await getTranslations("campaigns");
  const [templates, chats, planUsage] = await Promise.all([
    getTemplates(user.id),
    getChats(user.id),
    getPlanUsage(user.id),
  ]);

  if (templates.length === 0) {
    redirect("/dashboard/templates?need=campaign");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("new")} subtitle={t("subtitle")} />
      <p className="text-small text-muted-foreground">{t("newHint")}</p>
      <CampaignEditor
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
          present: c.present,
        }))}
      />
    </div>
  );
}
