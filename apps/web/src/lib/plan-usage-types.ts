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
  trialDaysLeft: number | null;
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
