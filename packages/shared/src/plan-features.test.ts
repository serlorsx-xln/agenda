import { describe, expect, it } from "vitest";

import {
  capAutoReplyCooldown,
  capMaxSends,
  hasPlanFeature,
  validateAutoReplyPlanInput,
  validateCampaignPlanInput,
} from "./plan-features";
import { getPlan, LOCKED_PLAN } from "./plan";

describe("hasPlanFeature", () => {
  it("reflects boolean and numeric feature flags", () => {
    const basic = getPlan("starter")!;
    const growth = getPlan("growth")!;
    expect(hasPlanFeature(basic, "autoReplyImages")).toBe(false);
    expect(hasPlanFeature(growth, "autoReplyImages")).toBe(true);
    expect(hasPlanFeature(basic, "autoReplyCooldownMaxSec")).toBe(true);
    expect(hasPlanFeature(LOCKED_PLAN, "autoReplyCooldownMaxSec")).toBe(false);
  });
});

describe("capMaxSends", () => {
  it("caps sends to plan daily limit", () => {
    const basic = getPlan("starter")!;
    expect(capMaxSends(basic, 100)).toBe(30);
    expect(capMaxSends(getPlan("pro")!, 1000)).toBe(500);
    expect(capMaxSends(LOCKED_PLAN, 10)).toBe(0);
  });
});

describe("capAutoReplyCooldown", () => {
  it("caps cooldown to plan maximum", () => {
    const basic = getPlan("starter")!;
    expect(capAutoReplyCooldown(basic, 120)).toBe(60);
    expect(capAutoReplyCooldown(getPlan("growth")!, 400)).toBe(300);
  });
});

describe("validateAutoReplyPlanInput", () => {
  it("rejects locked accounts", () => {
    expect(
      validateAutoReplyPlanInput(LOCKED_PLAN, {}),
    ).toEqual({ ok: false, error: "plan_locked" });
  });

  it("blocks image replies on basic", () => {
    const basic = getPlan("starter")!;
    expect(
      validateAutoReplyPlanInput(basic, { replyImageAssetIds: ["img-1"] }),
    ).toEqual({ ok: false, error: "plan_feature_autoReplyImages" });
    expect(
      validateAutoReplyPlanInput(basic, { templateHasImages: true }),
    ).toEqual({ ok: false, error: "plan_feature_autoReplyImages" });
  });

  it("blocks exact match on growth", () => {
    const growth = getPlan("growth")!;
    expect(
      validateAutoReplyPlanInput(growth, { matchMode: "exact" }),
    ).toEqual({ ok: false, error: "plan_feature_autoReplyExactMatch" });
  });

  it("allows pro exact match and caps cooldown", () => {
    const pro = getPlan("pro")!;
    expect(
      validateAutoReplyPlanInput(pro, {
        matchMode: "exact",
        cooldownSec: 5000,
      }),
    ).toEqual({ ok: false, error: "plan_feature_autoReplyCooldownMaxSec" });
    expect(
      validateAutoReplyPlanInput(pro, { cooldownSec: 120 }),
    ).toEqual({ ok: true, cooldownSec: 120 });
  });
});

describe("validateCampaignPlanInput", () => {
  it("rejects cron on basic and locked accounts", () => {
    const basic = getPlan("starter")!;
    expect(
      validateCampaignPlanInput(basic, {
        cronExpr: "0 9 * * *",
        maxSends: 10,
      }),
    ).toEqual({ ok: false, error: "plan_feature_schedulingCron" });
    expect(
      validateCampaignPlanInput(LOCKED_PLAN, {
        cronExpr: null,
        maxSends: 10,
      }),
    ).toEqual({ ok: false, error: "plan_locked" });
  });

  it("caps max sends for growth", () => {
    const growth = getPlan("growth")!;
    expect(
      validateCampaignPlanInput(growth, {
        cronExpr: "0 9 * * *",
        maxSends: 200,
      }),
    ).toEqual({ ok: true, maxSends: 100 });
  });
});
