import { getTranslations } from "next-intl/server";

import { OpenChatsClient } from "@/components/line/openchats-client";
import { PageHeader } from "@/components/dashboard/page-header";
import { getConnection } from "@/lib/db-helpers";
import { getPlanUsage } from "@/lib/plan-limits";
import { getCampaigns, getChats } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function OpenChatsPage() {
  const user = await requireUser();
  const t = await getTranslations("openchats");

  const [chats, campaigns, connection, planUsage] = await Promise.all([
    getChats(user.id),
    getCampaigns(user.id),
    getConnection(user.id),
    getPlanUsage(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <OpenChatsClient
        planUsage={planUsage}
        connected={connection?.status === "connected"}
        chats={chats.map((c) => ({
          id: c.id,
          chatMid: c.chatMid,
          name: c.name,
          kind: c.kind,
          memberCount: c.memberCount,
          present: c.present,
          lastSeenAt: c.lastSeenAt,
        }))}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
