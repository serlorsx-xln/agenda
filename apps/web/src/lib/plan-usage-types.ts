import type { PlanFeatures } from "@line/shared/plan";

export type OnboardingProgress = {
  connected: boolean;
  hasSyncedChats: boolean;
  hasTemplate: boolean;
  hasAutoReply: boolean;
  hasCampaign: boolean;
  hasRun: boolean;
};

export type PlanUsageSnapshot = {
  planId: string;
  planName: string;
  storedPlanId: string;
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
  /** True once a Growth trial was started (even if already ended). */
  trialStarted: boolean;
  trialDaysLeft: number | null;
  /** ISO timestamp when Growth trial ends (if on trial). */
  trialEndsAt: string | null;
  connected: boolean;
  features: PlanFeatures;
};

export type UpgradeLimitType =
  | "campaigns"
  | "targets"
  | "auto_reply_rules"
  | "media_assets"
  | "templates"
  | "plan_locked";
