import "server-only";

import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";

import {
  db,
  auditLog,
  campaignDailySends,
  campaignRunEvents,
  campaignRuns,
  campaignTargets,
  campaigns,
  lineChats,
  lineConnection,
  payments,
  subscriptions,
  templates,
  user,
} from "@line/db";

import {
  isWithinWindow,
  rotationIndexAt,
  statDateInTz,
} from "@/lib/campaign-timing";
import { getEffectivePlan } from "@/lib/subscription-trial";

export type CampaignListRow = {
  id: string;
  name: string;
  status: string;
  enabled: boolean;
  targetCount: number;
  maxSends: number;
  sentToday: number;
  nextTargetName: string | null;
  dailyRunId: string | null;
  withinWindow: boolean;
  dailyLimitReached: boolean;
};

export async function getChats(userId: string) {
  return db
    .select()
    .from(lineChats)
    .where(eq(lineChats.userId, userId))
    .orderBy(desc(lineChats.present), lineChats.name);
}

export async function getTemplates(userId: string) {
  return db
    .select()
    .from(templates)
    .where(eq(templates.userId, userId))
    .orderBy(desc(templates.updatedAt));
}

export async function getCampaigns(userId: string) {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.userId, userId))
    .orderBy(desc(campaigns.updatedAt));
}

export async function getCampaignsWithProgress(
  userId: string,
): Promise<CampaignListRow[]> {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      enabled: campaigns.enabled,
      maxSends: campaigns.maxSends,
      timezone: campaigns.timezone,
      windowStartHour: campaigns.windowStartHour,
      windowEndHour: campaigns.windowEndHour,
      sendRotationIndex: campaigns.sendRotationIndex,
      dailyRunId: campaigns.dailyRunId,
      targetCount: count(campaignTargets.id),
    })
    .from(campaigns)
    .leftJoin(campaignTargets, eq(campaignTargets.campaignId, campaigns.id))
    .where(eq(campaigns.userId, userId))
    .groupBy(campaigns.id)
    .orderBy(desc(campaigns.updatedAt));

  if (rows.length === 0) return [];

  const campaignIds = rows.map((r) => r.id);

  const [targetRows, dailyRows] = await Promise.all([
    db
      .select({
        campaignId: campaignTargets.campaignId,
        name: lineChats.name,
      })
      .from(campaignTargets)
      .innerJoin(
        lineChats,
        and(
          eq(lineChats.userId, userId),
          eq(lineChats.chatMid, campaignTargets.chatMid),
          eq(lineChats.present, true),
        ),
      )
      .where(
        and(
          inArray(campaignTargets.campaignId, campaignIds),
          eq(campaignTargets.enabled, true),
        ),
      )
      .orderBy(campaignTargets.campaignId, campaignTargets.chatMid),
    db
      .select({
        campaignId: campaignDailySends.campaignId,
        statDate: campaignDailySends.statDate,
        total: sql<number>`coalesce(sum(${campaignDailySends.sendCount}), 0)::int`,
      })
      .from(campaignDailySends)
      .where(inArray(campaignDailySends.campaignId, campaignIds))
      .groupBy(campaignDailySends.campaignId, campaignDailySends.statDate),
  ]);

  const targetsByCampaign = new Map<string, string[]>();
  for (const row of targetRows) {
    const list = targetsByCampaign.get(row.campaignId) ?? [];
    list.push(row.name ?? "Chat");
    targetsByCampaign.set(row.campaignId, list);
  }

  const sentByCampaignDate = new Map<string, number>();
  for (const row of dailyRows) {
    sentByCampaignDate.set(`${row.campaignId}:${row.statDate}`, row.total);
  }

  return rows.map((c) => {
    const targets = targetsByCampaign.get(c.id) ?? [];
    const statDate = statDateInTz(c.timezone);
    const sentToday = sentByCampaignDate.get(`${c.id}:${statDate}`) ?? 0;
    const rotationIdx = rotationIndexAt(c.sendRotationIndex, targets.length);
    const nextTargetName =
      targets.length > 0 ? (targets[rotationIdx] ?? null) : null;

    return {
      id: c.id,
      name: c.name,
      status: c.status,
      enabled: c.enabled,
      targetCount: Number(c.targetCount),
      maxSends: c.maxSends,
      sentToday,
      nextTargetName,
      dailyRunId: c.dailyRunId,
      withinWindow: isWithinWindow(c),
      dailyLimitReached: sentToday >= c.maxSends,
    };
  });
}

export async function getCampaignProgress(userId: string, campaignId: string) {
  const rows = await getCampaignsWithProgress(userId);
  return rows.find((r) => r.id === campaignId) ?? null;
}

export async function getCampaign(userId: string, campaignId: string) {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getCampaignTargets(campaignId: string) {
  return db
    .select({ chatMid: campaignTargets.chatMid, enabled: campaignTargets.enabled })
    .from(campaignTargets)
    .where(eq(campaignTargets.campaignId, campaignId));
}

/** All targets for a user's campaigns, grouped by campaign id. */
export async function getCampaignTargetsByUser(
  userId: string,
): Promise<Record<string, string[]>> {
  const rows = await db
    .select({
      campaignId: campaignTargets.campaignId,
      chatMid: campaignTargets.chatMid,
    })
    .from(campaignTargets)
    .innerJoin(campaigns, eq(campaignTargets.campaignId, campaigns.id))
    .where(eq(campaigns.userId, userId));

  const map: Record<string, string[]> = {};
  for (const row of rows) {
    (map[row.campaignId] ??= []).push(row.chatMid);
  }
  return map;
}

export async function getRuns(userId: string, limit = 50) {
  const plan = await getEffectivePlan(userId);
  const historyDays = plan.features.runHistoryDays;
  const conditions = [eq(campaignRuns.userId, userId)];
  if (historyDays !== null) {
    const since = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000);
    conditions.push(gte(campaignRuns.createdAt, since));
  }

  return db
    .select({
      id: campaignRuns.id,
      status: campaignRuns.status,
      trigger: campaignRuns.trigger,
      sentCount: campaignRuns.sentCount,
      failedCount: campaignRuns.failedCount,
      skippedCount: campaignRuns.skippedCount,
      totalTargets: campaignRuns.totalTargets,
      startedAt: campaignRuns.startedAt,
      finishedAt: campaignRuns.finishedAt,
      createdAt: campaignRuns.createdAt,
      campaignName: campaigns.name,
      campaignId: campaignRuns.campaignId,
    })
    .from(campaignRuns)
    .innerJoin(campaigns, eq(campaignRuns.campaignId, campaigns.id))
    .where(and(...conditions))
    .orderBy(desc(campaignRuns.createdAt))
    .limit(limit);
}

export async function getRun(userId: string, runId: string) {
  const [row] = await db
    .select()
    .from(campaignRuns)
    .where(and(eq(campaignRuns.id, runId), eq(campaignRuns.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getRunEvents(runId: string) {
  return db
    .select()
    .from(campaignRunEvents)
    .where(eq(campaignRunEvents.runId, runId))
    .orderBy(desc(campaignRunEvents.createdAt))
    .limit(200);
}

export async function getPayments(userId: string) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt));
}

/* -------------------- Admin (read-only) -------------------- */

export async function getAdminUsers(limit = 100) {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
      connectionStatus: lineConnection.status,
      plan: subscriptions.plan,
    })
    .from(user)
    .leftJoin(lineConnection, eq(lineConnection.userId, user.id))
    .leftJoin(subscriptions, eq(subscriptions.userId, user.id))
    .orderBy(desc(user.createdAt))
    .limit(limit);
}

export async function getAdminPayments(limit = 50) {
  return db
    .select({
      id: payments.id,
      userId: payments.userId,
      userEmail: user.email,
      plan: payments.plan,
      amount: payments.amount,
      status: payments.status,
      promptpayRef: payments.promptpayRef,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(user, eq(payments.userId, user.id))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
}

export async function getAdminRuns(limit = 50) {
  return db
    .select({
      id: campaignRuns.id,
      status: campaignRuns.status,
      sentCount: campaignRuns.sentCount,
      failedCount: campaignRuns.failedCount,
      createdAt: campaignRuns.createdAt,
      campaignName: campaigns.name,
      userEmail: user.email,
    })
    .from(campaignRuns)
    .innerJoin(campaigns, eq(campaignRuns.campaignId, campaigns.id))
    .innerJoin(user, eq(campaignRuns.userId, user.id))
    .orderBy(desc(campaignRuns.createdAt))
    .limit(limit);
}

export async function getAuditEntries(limit = 100) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      createdAt: auditLog.createdAt,
      userEmail: user.email,
    })
    .from(auditLog)
    .leftJoin(user, eq(auditLog.userId, user.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
