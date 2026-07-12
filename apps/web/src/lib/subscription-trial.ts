import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import {
  db,
  campaigns,
  autoReplyRules,
  mediaAssets,
  campaignRuns,
  enforceLockedPlanLimits,
  getEffectivePlanForUser,
  subscriptions,
} from "@line/db";
import {
  isPlanLocked,
  isTrialActive,
  resolveEffectivePlan as resolveSharedPlan,
  type Plan,
  type PlanId,
} from "@line/shared/plan";

import { getConnection, getSubscription } from "@/lib/db-helpers";
import { workerFetch } from "@/lib/worker";

const TRIAL_DAYS = 14;

export async function getEffectivePlan(userId: string): Promise<Plan> {
  return getEffectivePlanForUser(userId);
}

function resolveEffectivePlan(
  sub: Awaited<ReturnType<typeof getSubscription>>,
): Plan {
  if (!sub) return resolveSharedPlan(null);
  return resolveSharedPlan({
    plan: sub.plan as PlanId,
    status: sub.status,
    trialEndsAt: sub.trialEndsAt,
  });
}

type PlanUsage = {
  planId: PlanId;
  planName: string;
  storedPlanId: PlanId;
  campaignsUsed: number;
  campaignsMax: number;
  maxTargetsPerCampaign: number;
  autoReplyRulesUsed: number;
  autoReplyRulesMax: number;
  mediaAssetsUsed: number;
  mediaAssetsMax: number;
  autoReplyMatchesTotal: number;
  sentToday: number;
  isOnTrial: boolean;
  isLocked: boolean;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  connected: boolean;
  features: Plan["features"];
};

export async function getPlanUsage(userId: string): Promise<PlanUsage> {
  const [sub, conn] = await Promise.all([
    getSubscription(userId),
    getConnection(userId),
  ]);
  const plan = resolveEffectivePlan(sub);
  const onTrial = isTrialActive(
    sub
      ? {
          plan: sub.plan as PlanId,
          status: sub.status,
          trialEndsAt: sub.trialEndsAt,
        }
      : null,
  );

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    [campaignRow],
    [autoReplyRow],
    [mediaRow],
    [matchRow],
    [sentRow],
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(eq(campaigns.userId, userId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(autoReplyRules)
      .where(eq(autoReplyRules.userId, userId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaAssets)
      .where(eq(mediaAssets.userId, userId)),
    db
      .select({
        total: sql<number>`coalesce(sum(${autoReplyRules.matchedCount}), 0)::int`,
      })
      .from(autoReplyRules)
      .where(eq(autoReplyRules.userId, userId)),
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
  ]);

  let trialDaysLeft: number | null = null;
  if (onTrial && sub?.trialEndsAt) {
    trialDaysLeft = Math.max(
      0,
      Math.ceil(
        (sub.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      ),
    );
  }

  return {
    planId: plan.id,
    planName: plan.name,
    storedPlanId: (sub?.plan ?? "free") as PlanId,
    campaignsUsed: campaignRow?.count ?? 0,
    campaignsMax: plan.maxCampaigns,
    maxTargetsPerCampaign: plan.maxTargetsPerCampaign,
    autoReplyRulesUsed: autoReplyRow?.count ?? 0,
    autoReplyRulesMax: plan.maxAutoReplyRules,
    mediaAssetsUsed: mediaRow?.count ?? 0,
    mediaAssetsMax: plan.maxMediaAssets,
    autoReplyMatchesTotal: matchRow?.total ?? 0,
    sentToday: sentRow?.total ?? 0,
    isOnTrial: onTrial,
    isLocked: isPlanLocked(plan),
    trialDaysLeft,
    trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
    connected: conn?.status === "connected",
    features: plan.features,
  };
}

/** Start 14-day Growth trial on first LINE connect. Idempotent. */
async function maybeStartTrial(userId: string): Promise<void> {
  const conn = await getConnection(userId);
  if (conn?.status !== "connected") return;

  const sub = await getSubscription(userId);
  // Only free accounts get a trial; paid users (incl. admin-assigned) skip.
  if (!sub || sub.trialStartedAt || (sub.plan !== "free" && sub.status === "active")) {
    return;
  }

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  await db
    .update(subscriptions)
    .set({
      trialStartedAt: now,
      trialEndsAt,
      updatedAt: now,
    })
    .where(eq(subscriptions.userId, userId));
}

/** After trial ends on a free account, hard-lock (pause campaigns, disable auto-reply). */
async function enforceTrialExpiry(userId: string): Promise<void> {
  const sub = await getSubscription(userId);
  if (!sub?.trialEndsAt) return;
  if (sub.trialEndsAt.getTime() > Date.now()) return;
  if (sub.plan !== "free") return;

  await enforceLockedPlanLimits(userId);
  try {
    await workerFetch(`/line/${userId}/auto-reply/sync`, { method: "POST" });
  } catch {
    // Worker may be unavailable; rules are trimmed in DB regardless.
  }
}

/** Run trial lifecycle on dashboard load. Trial-ending emails are sent by the cron route. */
export async function syncSubscriptionLifecycle(userId: string): Promise<void> {
  await maybeStartTrial(userId);
  await enforceTrialExpiry(userId);
}
