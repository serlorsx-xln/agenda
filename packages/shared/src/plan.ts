export type PaidPlanId = "starter" | "growth" | "pro";
export type PlanId = "free" | PaidPlanId | "locked";

export type PlanFeatures = {
  autoReplyImages: boolean;
  autoReplyExcludeKeywords: boolean;
  autoReplyEmojiFilter: boolean;
  autoReplyExactMatch: boolean;
  autoReplyPriority: boolean;
  autoReplyCooldownMaxSec: number;
  schedulingCron: boolean;
  maxSendsPerDayCap: number;
  maxTemplates: number | null;
  runHistoryDays: number | null;
};

export type Plan = {
  id: PlanId;
  name: string;
  monthlyAmount: number;
  maxCampaigns: number;
  maxTargetsPerCampaign: number;
  maxAutoReplyRules: number;
  maxMediaAssets: number;
  features: PlanFeatures;
  highlighted?: boolean;
  /** When true the account cannot run campaigns or auto-reply. */
  locked?: boolean;
};

const STARTER_FEATURES: PlanFeatures = {
  autoReplyImages: false,
  autoReplyExcludeKeywords: false,
  autoReplyEmojiFilter: false,
  autoReplyExactMatch: false,
  autoReplyPriority: false,
  autoReplyCooldownMaxSec: 60,
  schedulingCron: false,
  maxSendsPerDayCap: 100,
  maxTemplates: 5,
  runHistoryDays: 14,
};

const GROWTH_FEATURES: PlanFeatures = {
  autoReplyImages: true,
  autoReplyExcludeKeywords: true,
  autoReplyEmojiFilter: true,
  autoReplyExactMatch: false,
  autoReplyPriority: false,
  autoReplyCooldownMaxSec: 300,
  schedulingCron: true,
  maxSendsPerDayCap: 150,
  maxTemplates: null,
  runHistoryDays: 90,
};

const PRO_FEATURES: PlanFeatures = {
  autoReplyImages: true,
  autoReplyExcludeKeywords: true,
  autoReplyEmojiFilter: true,
  autoReplyExactMatch: true,
  autoReplyPriority: true,
  autoReplyCooldownMaxSec: 3600,
  schedulingCron: true,
  maxSendsPerDayCap: 250,
  maxTemplates: null,
  runHistoryDays: null,
};

const LOCKED_FEATURES: PlanFeatures = {
  autoReplyImages: false,
  autoReplyExcludeKeywords: false,
  autoReplyEmojiFilter: false,
  autoReplyExactMatch: false,
  autoReplyPriority: false,
  autoReplyCooldownMaxSec: 0,
  schedulingCron: false,
  maxSendsPerDayCap: 0,
  maxTemplates: 0,
  runHistoryDays: 14,
};

/** Sellable + internal plans. `free` is DB-only pre-payment state. */
export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Basic",
    monthlyAmount: 79,
    maxCampaigns: 2,
    maxTargetsPerCampaign: 10,
    maxAutoReplyRules: 3,
    maxMediaAssets: 10,
    features: STARTER_FEATURES,
  },
  {
    id: "growth",
    name: "Growth",
    monthlyAmount: 149,
    maxCampaigns: 5,
    maxTargetsPerCampaign: 30,
    maxAutoReplyRules: 15,
    maxMediaAssets: 40,
    features: GROWTH_FEATURES,
    highlighted: true,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyAmount: 249,
    maxCampaigns: 20,
    maxTargetsPerCampaign: 100,
    maxAutoReplyRules: 50,
    maxMediaAssets: 150,
    features: PRO_FEATURES,
  },
];

export const LOCKED_PLAN: Plan = {
  id: "locked",
  name: "Trial ended",
  monthlyAmount: 0,
  maxCampaigns: 0,
  maxTargetsPerCampaign: 0,
  maxAutoReplyRules: 0,
  maxMediaAssets: 0,
  features: LOCKED_FEATURES,
  locked: true,
};

/** Plans shown on billing / marketing (paid only). */
export type PaidPlan = Plan & { id: PaidPlanId };
export const PAID_PLANS: PaidPlan[] = PLANS as PaidPlan[];
/** Plan ids that renew / expire via billing cron (Basic/Growth/Pro). */
export const PAID_PLAN_IDS: PaidPlanId[] = PAID_PLANS.map((p) => p.id);

export function getPlan(id: string): Plan | undefined {
  if (id === "locked") return LOCKED_PLAN;
  return PLANS.find((p) => p.id === id);
}

export function isPlanLocked(plan: Plan): boolean {
  return plan.locked === true || plan.id === "locked";
}

export type SubscriptionSnapshot = {
  plan: PlanId;
  status: "active" | "past_due" | "cancelled" | "inactive";
  trialEndsAt: Date | null;
} | null;

/** Paid active plans always win over leftover trial dates. */
function isPaidActive(sub: SubscriptionSnapshot): boolean {
  return Boolean(
    sub &&
      sub.plan !== "free" &&
      sub.plan !== "locked" &&
      sub.status === "active",
  );
}

export function isTrialActive(sub: SubscriptionSnapshot): boolean {
  if (!sub?.trialEndsAt) return false;
  if (sub.trialEndsAt.getTime() <= Date.now()) return false;
  if (isPaidActive(sub)) return false;
  return true;
}

/** Resolve the effective plan limits from a subscription row. */
export function resolveEffectivePlan(sub: SubscriptionSnapshot): Plan {
  if (isPaidActive(sub)) {
    return getPlan(sub!.plan) ?? LOCKED_PLAN;
  }
  if (isTrialActive(sub)) {
    return getPlan("growth")!;
  }
  return LOCKED_PLAN;
}
