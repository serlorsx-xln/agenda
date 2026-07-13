import { afterEach, describe, expect, it, vi } from "vitest";

import {
  nextRotationIndex,
  rotationIndexAt,
  shouldReuseDailyRun,
} from "./send-queue-utils.js";
import {
  cancelRun,
  isRunCancelled,
  resetRunCancellation,
} from "./run-cancellation.js";

vi.mock("../line/manager.js", () => ({
  lineManager: {
    getReadyClient: vi.fn(),
    sendTemplateContent: vi.fn(),
    validateE2EEForUser: vi.fn(),
  },
}));

vi.mock("@line/db", () => {
  const chain = () => ({
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "run-1" }]),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  });
  return {
    db: {
      select: vi.fn(() => chain()),
      insert: vi.fn(() => chain()),
      update: vi.fn(() => chain()),
    },
    campaignDailySends: {},
    campaignRunEvents: {},
    campaignRuns: { id: "id", sentCount: "sentCount", failedCount: "failedCount" },
    campaignTargets: {},
    campaigns: { id: "id" },
    lineChats: {},
    subscriptions: {},
    templates: {},
    user: {},
  };
});

import { lineManager } from "../line/manager.js";
import { db } from "@line/db";
import { sendNextInRotation } from "./send-queue.js";

const baseCampaign = {
  id: "camp-1",
  userId: "user-1",
  templateId: "tpl-1",
  name: "Test",
  status: "active" as const,
  enabled: true,
  timezone: "UTC",
  windowStartHour: 0,
  windowEndHour: 24,
  cronExpr: null,
  maxSends: 10,
  delayBetweenTargetsSec: 300,
  randomJitterSec: 0,
  autoStopOnErrors: 3,
  lastRunAt: null,
  sendRotationIndex: 0,
  nextSendAt: null,
  dailyRunId: null,
  rateLimitStreak: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockDbForSuccessfulSend(targets: { chatMid: string; name: string }[]) {
  const selectMock = vi.mocked(db.select);
  selectMock.mockImplementation(() => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(targets),
      limit: vi.fn().mockResolvedValue([]),
    };
    return chain as never;
  });
}

describe("send-queue rotation helpers", () => {
  it("rotates through targets in order", () => {
    expect(rotationIndexAt(0, 3)).toBe(0);
    expect(rotationIndexAt(1, 3)).toBe(1);
    expect(rotationIndexAt(3, 3)).toBe(0);
    expect(nextRotationIndex(2, 3)).toBe(0);
  });

  it("reuses daily run within the same campaign timezone day", () => {
    const morning = new Date("2026-07-08T08:00:00Z");
    const evening = new Date("2026-07-08T20:00:00Z");
    expect(shouldReuseDailyRun(morning, evening, "UTC")).toBe(true);
    expect(
      shouldReuseDailyRun(morning, new Date("2026-07-09T01:00:00Z"), "UTC"),
    ).toBe(false);
  });
});

describe("run cancellation", () => {
  afterEach(() => {
    resetRunCancellation();
  });

  it("blocks send when daily run is cancelled", async () => {
    cancelRun("run-cancelled");
    mockDbForSuccessfulSend([{ chatMid: "g1", name: "G1" }]);

    const result = await sendNextInRotation(
      { ...baseCampaign, dailyRunId: "run-cancelled" },
      "manual",
    );

    expect(result).toEqual({
      ok: false,
      reason: "Run cancelled",
      sent: false,
    });
    expect(lineManager.sendTemplateContent).not.toHaveBeenCalled();
  });

  it("tracks cancelled run ids", () => {
    expect(isRunCancelled("run-x")).toBe(false);
    cancelRun("run-x");
    expect(isRunCancelled("run-x")).toBe(true);
  });
});
