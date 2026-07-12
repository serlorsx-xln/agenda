import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/dashboard/page-header";
import { AutoReplyClient } from "@/components/auto-reply/auto-reply-client";
import { getChats, getTemplates } from "@/lib/queries";
import { getConnection } from "@/lib/db-helpers";
import { getPlanUsage } from "@/lib/plan-limits";
import { requireUser } from "@/lib/session";
import { workerFetch } from "@/lib/worker";

type AutoReplyRule = {
  id: string;
  chatMids: string[];
  includeKeywords: string[];
  excludeKeywords: string[];
  emojiFilter: "any" | "with_emoji" | "without_emoji";
  replyText: string | null;
  templateId: string | null;
  replyImageAssetIds?: string[];
  matchMode: "contains" | "exact";
  enabled: boolean;
  cooldownSec: number;
  priority: number;
  matchedCount: number;
  lastMatchedAt: string | null;
};

export default async function AutoReplyPage() {
  const user = await requireUser();
  const t = await getTranslations("autoReply");

  const [chats, templates, connection, workerResult, lineStatus, planUsage] =
    await Promise.all([
    getChats(user.id),
    getTemplates(user.id),
    getConnection(user.id),
    workerFetch<{
      rules: AutoReplyRule[];
      runtime: {
        listening: boolean;
        ruleCount?: number;
        elapsedSec?: number;
        chatMids?: string[];
      };
    }>(`/line/${user.id}/auto-reply/rules`).then(
      (data) => ({ ok: true as const, data }),
      (err) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : "worker_unavailable",
      }),
    ),
    workerFetch<{ e2eeStatus?: "ok" | "degraded" | "invalid" }>(
      `/line/${user.id}/status`,
    ).then(
      (data) => ({ ok: true as const, data }),
      () => ({ ok: false as const }),
    ),
    getPlanUsage(user.id),
  ]);

  const workerData = workerResult.ok
    ? workerResult.data
    : { rules: [], runtime: { listening: false } };
  const workerError = workerResult.ok ? undefined : workerResult.error;

  const chatNameByMid = Object.fromEntries(
    chats.map((c) => [c.chatMid, c.name]),
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <AutoReplyClient
        rules={workerData.rules}
        runtime={workerData.runtime}
        chats={chats.map((c) => ({
          chatMid: c.chatMid,
          name: c.name,
          kind: c.kind,
          present: c.present,
        }))}
        templates={templates.map((tpl) => ({
          id: tpl.id,
          name: tpl.name,
          body: tpl.body,
          imageAssetIds: tpl.imageAssetIds,
        }))}
        chatNameByMid={chatNameByMid}
        connected={connection?.status === "connected"}
        workerError={workerError}
        e2eeStatus={
          lineStatus.ok ? (lineStatus.data.e2eeStatus ?? "ok") : "ok"
        }
        planFeatures={planUsage.features}
        isLocked={planUsage.isLocked}
      />
    </div>
  );
}
