import { describe, expect, it, vi } from "vitest";

import {
  accountCooldownRemainingSec,
  backoffSecondsForStreak,
  chatCooldownRemainingSec,
  computeDelaySec,
  computeNextSendAt,
  isRateLimitError,
  nextRotationIndex,
  pickEligibleTargetIndex,
  pickNextCampaign,
  rotationIndexAt,
  shouldReuseDailyRun,
} from "./send-queue-utils.js";

describe("computeDelaySec", () => {
  it("respects minimum 300s floor", () => {
    expect(computeDelaySec(10, 0, 10, 3600)).toBeGreaterThanOrEqual(300);
  });

  it("uses even spread when window is tight", () => {
    // 2 remaining sends in 15 min → 450s > 300s floor
    const delay = computeDelaySec(300, 0, 2, 900);
    expect(delay).toBeGreaterThanOrEqual(450);
  });

  it("adds jitter to user delay", () => {
    const base = computeDelaySec(300, 0, 100, 3600);
    vi.spyOn(Math, "random").mockReturnValue(1);
    expect(computeDelaySec(300, 60, 100, 3600)).toBeGreaterThan(base);
    vi.restoreAllMocks();
  });
});

describe("pickEligibleTargetIndex", () => {
  it("picks the first chat past per-chat cooldown", () => {
    const now = new Date("2026-07-13T12:00:00Z");
    const targets = [
      { lastSentAt: new Date("2026-07-13T11:45:00Z") }, // 15 min ago — cooling
      { lastSentAt: new Date("2026-07-13T11:00:00Z") }, // 60 min ago — ready
      { lastSentAt: null },
    ];
    const pick = pickEligibleTargetIndex(targets, 0, 1800, now);
    expect(pick).toEqual({ ok: true, index: 1 });
  });

  it("returns earliestReadyAt when all chats are cooling", () => {
    const now = new Date("2026-07-13T12:00:00Z");
    const targets = [
      { lastSentAt: new Date("2026-07-13T11:50:00Z") }, // ready in 20 min
      { lastSentAt: new Date("2026-07-13T11:40:00Z") }, // ready in 10 min
    ];
    const pick = pickEligibleTargetIndex(targets, 0, 1800, now);
    expect(pick.ok).toBe(false);
    if (!pick.ok) {
      expect(pick.earliestReadyAt.toISOString()).toBe(
        "2026-07-13T12:10:00.000Z",
      );
    }
  });
});

describe("account and chat cooldown helpers", () => {
  it("enforces 5 min account floor", () => {
    const now = new Date("2026-07-13T12:05:00Z");
    expect(
      accountCooldownRemainingSec(new Date("2026-07-13T12:00:00Z"), now),
    ).toBe(0);
    expect(
      accountCooldownRemainingSec(new Date("2026-07-13T12:03:00Z"), now),
    ).toBe(180);
  });

  it("enforces 30 min per-chat floor even if configured lower", () => {
    const now = new Date("2026-07-13T12:20:00Z");
    expect(
      chatCooldownRemainingSec(new Date("2026-07-13T12:00:00Z"), 1800, now),
    ).toBe(600);
    // Configured 10 min still floors at 30 min → ready exactly at 12:20
    expect(
      chatCooldownRemainingSec(new Date("2026-07-13T11:50:00Z"), 600, now),
    ).toBe(0);
  });
});

describe("computeNextSendAt", () => {
  it("takes the later of account delay and chat ready", () => {
    const now = new Date("2026-07-13T12:00:00Z");
    const chatReady = new Date("2026-07-13T12:20:00Z");
    expect(computeNextSendAt(now, 300, chatReady).toISOString()).toBe(
      "2026-07-13T12:20:00.000Z",
    );
    expect(computeNextSendAt(now, 300, null).toISOString()).toBe(
      "2026-07-13T12:05:00.000Z",
    );
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
