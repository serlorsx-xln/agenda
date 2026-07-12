import type { Plan, PlanFeatures } from "./plan";
import { isPlanLocked } from "./plan";

export type PlanFeatureKey = keyof PlanFeatures;

export function hasPlanFeature(plan: Plan, key: PlanFeatureKey): boolean {
  const value = plan.features[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return value !== null && value !== 0;
}

export function capMaxSends(plan: Plan, requested: number): number {
  const cap = plan.features.maxSendsPerDayCap;
  if (cap <= 0) return 0;
  return Math.min(requested, cap);
}

export function capAutoReplyCooldown(plan: Plan, requested: number): number {
  const max = plan.features.autoReplyCooldownMaxSec;
  if (max <= 0) return 0;
  return Math.min(Math.max(0, requested), max);
}

export type AutoReplyPlanInput = {
  excludeKeywords?: string[];
  emojiFilter?: "any" | "with_emoji" | "without_emoji";
  matchMode?: "contains" | "exact";
  replyImageAssetIds?: string[];
  templateHasImages?: boolean;
  cooldownSec?: number;
  priority?: number;
};

export function validateAutoReplyPlanInput(
  plan: Plan,
  input: AutoReplyPlanInput,
): { ok: true; cooldownSec?: number } | { ok: false; error: string } {
  if (isPlanLocked(plan)) {
    return { ok: false, error: "plan_locked" };
  }
  if (
    (input.replyImageAssetIds?.length || input.templateHasImages) &&
    !hasPlanFeature(plan, "autoReplyImages")
  ) {
    return { ok: false, error: "plan_feature_autoReplyImages" };
  }
  if (
    input.excludeKeywords?.length &&
    !hasPlanFeature(plan, "autoReplyExcludeKeywords")
  ) {
    return { ok: false, error: "plan_feature_autoReplyExcludeKeywords" };
  }
  if (
    input.emojiFilter &&
    input.emojiFilter !== "any" &&
    !hasPlanFeature(plan, "autoReplyEmojiFilter")
  ) {
    return { ok: false, error: "plan_feature_autoReplyEmojiFilter" };
  }
  if (
    input.matchMode === "exact" &&
    !hasPlanFeature(plan, "autoReplyExactMatch")
  ) {
    return { ok: false, error: "plan_feature_autoReplyExactMatch" };
  }
  if (
    input.priority !== undefined &&
    input.priority > 0 &&
    !hasPlanFeature(plan, "autoReplyPriority")
  ) {
    return { ok: false, error: "plan_feature_autoReplyPriority" };
  }
  if (input.cooldownSec !== undefined) {
    const capped = capAutoReplyCooldown(plan, input.cooldownSec);
    if (input.cooldownSec > capped) {
      return { ok: false, error: "plan_feature_autoReplyCooldownMaxSec" };
    }
    return { ok: true, cooldownSec: capped };
  }
  return { ok: true };
}

export function validateCampaignPlanInput(
  plan: Plan,
  input: { cronExpr: string | null; maxSends: number },
): { ok: true; maxSends: number } | { ok: false; error: string } {
  if (isPlanLocked(plan)) {
    return { ok: false, error: "plan_locked" };
  }
  if (input.cronExpr && !hasPlanFeature(plan, "schedulingCron")) {
    return { ok: false, error: "plan_feature_schedulingCron" };
  }
  const maxSends = capMaxSends(plan, input.maxSends);
  if (maxSends < 1) {
    return { ok: false, error: "plan_locked" };
  }
  return { ok: true, maxSends };
}
