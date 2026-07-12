import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";

import {
  db,
  autoReplyRules,
  campaignRuns,
  campaigns,
  lineChats,
  lineConnection,
  subscriptions,
  templates,
} from "@line/db";
import type { OnboardingProgress } from "@/lib/plan-usage-types";

/**
 * Ensure the per-user singleton rows exist (LINE connection + subscription).
 * Safe to call on every dashboard load.
 */
export async function ensureUserResources(userId: string): Promise<void> {
  await db
    .insert(lineConnection)
    .values({ userId, status: "disconnected" })
    .onConflictDoNothing({ target: lineConnection.userId });

  await db
    .insert(subscriptions)
    .values({ userId, plan: "free", status: "active" })
    .onConflictDoNothing({ target: subscriptions.userId });
}

export async function getConnection(userId: string) {
  const rows = await db
    .select()
    .from(lineConnection)
    .where(eq(lineConnection.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSubscription(userId: string) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export type OverviewStats = {
  connectionStatus: string;
  activeCampaigns: number;
  runsLast7Days: number;
  sentToday: number;
  autoReplyRuleCount: number;
  autoReplyMatchesTotal: number;
};

export async function getOverviewStats(
  userId: string,
): Promise<OverviewStats> {
  const conn = await getConnection(userId);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    [activeCampaignsRow],
    [runsRow],
    [sentRow],
    [autoReplyRow],
    [matchRow],
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(and(eq(campaigns.userId, userId), eq(campaigns.enabled, true))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignRuns)
      .where(
        and(
          eq(campaignRuns.userId, userId),
          gte(campaignRuns.createdAt, sevenDaysAgo),
        ),
      ),
    db
      .select({
        total: sql<number>`coalesce(sum(${campaignRuns.sentCount}), 0)::int`,
      })
      .from(campaignRuns)
      .where(
        and(
          eq(campaignRuns.userId, userId),
          gte(campaignRuns.createdAt, startOfDay),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(autoReplyRules)
      .where(eq(autoReplyRules.userId, userId)),
    db
      .select({
        total: sql<number>`coalesce(sum(${autoReplyRules.matchedCount}), 0)::int`,
      })
      .from(autoReplyRules)
      .where(eq(autoReplyRules.userId, userId)),
  ]);

  return {
    connectionStatus: conn?.status ?? "disconnected",
    activeCampaigns: activeCampaignsRow?.count ?? 0,
    runsLast7Days: runsRow?.count ?? 0,
    sentToday: sentRow?.total ?? 0,
    autoReplyRuleCount: autoReplyRow?.count ?? 0,
    autoReplyMatchesTotal: matchRow?.total ?? 0,
  };
}

export async function getRecentRuns(userId: string, limit = 5) {
  return db
    .select({
      id: campaignRuns.id,
      status: campaignRuns.status,
      sentCount: campaignRuns.sentCount,
      failedCount: campaignRuns.failedCount,
      createdAt: campaignRuns.createdAt,
      campaignName: campaigns.name,
    })
    .from(campaignRuns)
    .innerJoin(campaigns, eq(campaignRuns.campaignId, campaigns.id))
    .where(eq(campaignRuns.userId, userId))
    .orderBy(desc(campaignRuns.createdAt))
    .limit(limit);
}

export async function getOnboardingProgress(
  userId: string,
): Promise<OnboardingProgress> {
  const conn = await getConnection(userId);
  const connected = conn?.status === "connected";

  const [chatRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lineChats)
    .where(eq(lineChats.userId, userId));

  const [templateRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(templates)
    .where(eq(templates.userId, userId));

  const [autoReplyRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autoReplyRules)
    .where(eq(autoReplyRules.userId, userId));

  const [campaignRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(eq(campaigns.userId, userId));

  const [runRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaignRuns)
    .where(eq(campaignRuns.userId, userId));

  return {
    connected,
    hasSyncedChats: (chatRow?.count ?? 0) > 0,
    hasTemplate: (templateRow?.count ?? 0) > 0,
    hasAutoReply: (autoReplyRow?.count ?? 0) > 0,
    hasCampaign: (campaignRow?.count ?? 0) > 0,
    hasRun: (runRow?.count ?? 0) > 0,
  };
}
