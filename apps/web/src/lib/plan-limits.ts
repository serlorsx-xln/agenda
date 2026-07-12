import "server-only";

import { eq, sql } from "drizzle-orm";

import {
  hasPlanFeature,
  validateAutoReplyPlanInput,
  validateCampaignPlanInput,
  type PlanFeatureKey,
} from "@line/shared/plan-features";
import { isPlanLocked, type Plan } from "@line/shared/plan";

import {
  db,
  campaignTargets,
  campaigns,
  autoReplyRules,
  mediaAssets,
  templates,
} from "@line/db";

import { getEffectivePlan, getPlanUsage } from "@/lib/subscription-trial";

export { getPlanUsage };
export {
  validateAutoReplyPlanInput,
  validateCampaignPlanInput,
  hasPlanFeature,
  type PlanFeatureKey,
};

export async function assertNotLocked(
  userId: string,
): Promise<{ ok: true; plan: Plan } | { ok: false; error: string }> {
  const plan = await getEffectivePlan(userId);
  if (isPlanLocked(plan)) {
    return { ok: false, error: "plan_locked" };
  }
  return { ok: true, plan };
}

export async function assertCanCreateCampaign(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertNotLocked(userId);
  if (!gate.ok) return gate;
  const plan = gate.plan;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(eq(campaigns.userId, userId));
  if ((row?.count ?? 0) >= plan.maxCampaigns) {
    return { ok: false, error: "plan_limit_campaigns" };
  }
  return { ok: true };
}

export async function assertCanSetTargetCount(
  userId: string,
  targetCount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertNotLocked(userId);
  if (!gate.ok) return gate;
  if (targetCount > gate.plan.maxTargetsPerCampaign) {
    return { ok: false, error: "plan_limit_targets" };
  }
  return { ok: true };
}

export async function assertCanAddTarget(
  userId: string,
  campaignId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertNotLocked(userId);
  if (!gate.ok) return gate;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaignTargets)
    .where(eq(campaignTargets.campaignId, campaignId));
  if ((row?.count ?? 0) >= gate.plan.maxTargetsPerCampaign) {
    return { ok: false, error: "plan_limit_targets" };
  }
  return { ok: true };
}

export async function assertCanCreateAutoReplyRule(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertNotLocked(userId);
  if (!gate.ok) return gate;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(autoReplyRules)
    .where(eq(autoReplyRules.userId, userId));
  if ((row?.count ?? 0) >= gate.plan.maxAutoReplyRules) {
    return { ok: false, error: "plan_limit_auto_reply_rules" };
  }
  return { ok: true };
}

export async function assertCanUploadMedia(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertNotLocked(userId);
  if (!gate.ok) return gate;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaAssets)
    .where(eq(mediaAssets.userId, userId));
  if ((row?.count ?? 0) >= gate.plan.maxMediaAssets) {
    return { ok: false, error: "plan_limit_media_assets" };
  }
  return { ok: true };
}

export async function assertCanCreateTemplate(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertNotLocked(userId);
  if (!gate.ok) return gate;
  const max = gate.plan.features.maxTemplates;
  if (max === null) return { ok: true };
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(templates)
    .where(eq(templates.userId, userId));
  if ((row?.count ?? 0) >= max) {
    return { ok: false, error: "plan_limit_templates" };
  }
  return { ok: true };
}
