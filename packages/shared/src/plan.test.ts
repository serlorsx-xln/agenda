import { describe, expect, it } from "vitest";

import {
  getPlan,
  isPlanLocked,
  isTrialActive,
  LOCKED_PLAN,
  PAID_PLANS,
  PLANS,
  resolveEffectivePlan,
} from "./plan";

describe("getPlan", () => {
  it("returns plan by id", () => {
    expect(getPlan("starter")?.maxCampaigns).toBe(2);
    expect(getPlan("growth")?.monthlyAmount).toBe(149);
    expect(getPlan("pro")?.monthlyAmount).toBe(249);
    expect(getPlan("locked")?.locked).toBe(true);
    expect(getPlan("missing")).toBeUndefined();
  });
});

describe("isTrialActive", () => {
  it("returns false without trial end date", () => {
    expect(isTrialActive(null)).toBe(false);
    expect(isTrialActive({ plan: "free", status: "active", trialEndsAt: null })).toBe(false);
  });

  it("returns true when trial end is in the future on free plan", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(
      isTrialActive({ plan: "free", status: "active", trialEndsAt: future }),
    ).toBe(true);
  });

  it("returns false when a paid plan is already active", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(
      isTrialActive({ plan: "pro", status: "active", trialEndsAt: future }),
    ).toBe(false);
  });
});

describe("resolveEffectivePlan", () => {
  it("returns growth limits during active trial", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const plan = resolveEffectivePlan({
      plan: "free",
      status: "active",
      trialEndsAt: future,
    });
    expect(plan.id).toBe("growth");
    expect(plan.features.schedulingCron).toBe(true);
  });

  it("returns locked plan by default", () => {
    expect(resolveEffectivePlan(null).id).toBe("locked");
    expect(isPlanLocked(resolveEffectivePlan(null))).toBe(true);
    expect(
      resolveEffectivePlan({
        plan: "free",
        status: "active",
        trialEndsAt: null,
      }).id,
    ).toBe("locked");
  });

  it("returns paid plan when subscription is active", () => {
    const plan = resolveEffectivePlan({
      plan: "pro",
      status: "active",
      trialEndsAt: null,
    });
    expect(plan.id).toBe("pro");
    expect(plan.maxCampaigns).toBe(getPlan("pro")!.maxCampaigns);
  });

  it("prefers paid plan over leftover trial dates", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const plan = resolveEffectivePlan({
      plan: "pro",
      status: "active",
      trialEndsAt: future,
    });
    expect(plan.id).toBe("pro");
  });

  it("exports three paid plans with new pricing", () => {
    expect(PLANS).toHaveLength(3);
    expect(PAID_PLANS).toHaveLength(3);
    expect(PAID_PLANS.map((p) => p.monthlyAmount)).toEqual([79, 149, 249]);
    expect(PAID_PLANS.map((p) => p.features.maxSendsPerDayCap)).toEqual([
      100, 150, 250,
    ]);
  });

  it("locked plan blocks all quotas", () => {
    expect(LOCKED_PLAN.maxCampaigns).toBe(0);
    expect(LOCKED_PLAN.features.maxSendsPerDayCap).toBe(0);
  });
});
