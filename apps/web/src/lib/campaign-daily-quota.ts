import "server-only";

import { eq, inArray, sql } from "drizzle-orm";

import { db, campaignDailySends, campaigns } from "@line/db";
import { DEFAULT_CAMPAIGN_TIMEZONE } from "@line/shared/timezone";

import { statDateInTz } from "@/lib/campaign-timing";

/** Sum today's successful group sends using each campaign's timezone calendar day. */
export async function getDailySendTotalForUser(userId: string): Promise<number> {
  const camps = await db
    .select({ id: campaigns.id, timezone: campaigns.timezone })
    .from(campaigns)
    .where(eq(campaigns.userId, userId));
  if (camps.length === 0) return 0;

  const campaignIds = camps.map((c) => c.id);
  const dailyRows = await db
    .select({
      campaignId: campaignDailySends.campaignId,
      statDate: campaignDailySends.statDate,
      total: sql<number>`coalesce(sum(${campaignDailySends.sendCount}), 0)::int`,
    })
    .from(campaignDailySends)
    .where(inArray(campaignDailySends.campaignId, campaignIds))
    .groupBy(campaignDailySends.campaignId, campaignDailySends.statDate);

  const byKey = new Map(
    dailyRows.map((r) => [`${r.campaignId}:${r.statDate}`, r.total] as const),
  );
  let total = 0;
  for (const c of camps) {
    const tz = c.timezone || DEFAULT_CAMPAIGN_TIMEZONE;
    total += byKey.get(`${c.id}:${statDateInTz(tz)}`) ?? 0;
  }
  return total;
}
