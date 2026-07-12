import { describe, expect, it, vi } from "vitest";

import {
  backoffSecondsForStreak,
  computeDelaySec,
  isRateLimitError,
  nextRotationIndex,
  pickNextCampaign,
  rotationIndexAt,
  shouldReuseDailyRun,
} from "./send-queue-utils.js";

describe("computeDelaySec", () => {
  it("respects minimum 45s floor", () => {
    expect(computeDelaySec(10, 0, 10, 3600)).toBeGreaterThanOrEqual(45);
  });

  it("uses even spread when window is tight", () => {
    const delay = computeDelaySec(45, 0, 10, 900);
    expect(delay).toBeGreaterThanOrEqual(90);
  });

  it("adds jitter to user delay", () => {
    const base = computeDelaySec(45, 0, 100, 3600);
    vi.spyOn(Math, "random").mockReturnValue(1);
    expect(computeDelaySec(45, 30, 100, 3600)).toBeGreaterThan(base);
    vi.restoreAllMocks();
  });
});

describe("pickNextCampaign", () => {
  it("picks earliest next_send_at", () => {
    const a = {
      id: "a",
      userId: "u1",
      nextSendAt: new Date("2026-01-02T10:00:00Z"),
      lastRunAt: null,
    };
    const b = {
      id: "b",
      userId: "u1",
      nextSendAt: new Date("2026-01-02T09:00:00Z"),
      lastRunAt: null,
    };
    expect(pickNextCampaign([a, b])?.id).toBe("b");
  });

  it("tie-breaks on oldest last_run_at", () => {
    const a = {
      id: "a",
      userId: "u1",
      nextSendAt: new Date("2026-01-02T10:00:00Z"),
      lastRunAt: new Date("2026-01-02T08:00:00Z"),
    };
    const b = {
      id: "b",
      userId: "u1",
      nextSendAt: new Date("2026-01-02T10:00:00Z"),
      lastRunAt: new Date("2026-01-02T07:00:00Z"),
    };
    expect(pickNextCampaign([a, b])?.id).toBe("b");
  });
});

describe("backoffSecondsForStreak", () => {
  it("follows 2m / 5m / 15m ladder", () => {
    expect(backoffSecondsForStreak(1)).toBe(120);
    expect(backoffSecondsForStreak(2)).toBe(300);
    expect(backoffSecondsForStreak(3)).toBe(900);
    expect(backoffSecondsForStreak(10)).toBe(900);
  });
});

describe("isRateLimitError", () => {
  it("detects common rate-limit phrases", () => {
    expect(isRateLimitError(new Error("429 Too Many Requests"))).toBe(true);
    expect(isRateLimitError(new Error("LINE rate limit exceeded"))).toBe(true);
    expect(isRateLimitError(new Error("session expired"))).toBe(false);
  });
});

describe("rotationIndexAt", () => {
  it("wraps rotation index across targets", () => {
    expect(rotationIndexAt(0, 5)).toBe(0);
    expect(rotationIndexAt(5, 5)).toBe(0);
    expect(nextRotationIndex(4, 5)).toBe(0);
  });
});

describe("shouldReuseDailyRun", () => {
  it("matches same calendar day in timezone", () => {
    const a = new Date("2026-07-08T01:00:00Z");
    const b = new Date("2026-07-08T22:00:00Z");
    expect(shouldReuseDailyRun(a, b, "UTC")).toBe(true);
    expect(
      shouldReuseDailyRun(a, new Date("2026-07-09T00:00:00Z"), "UTC"),
    ).toBe(false);
  });
});
