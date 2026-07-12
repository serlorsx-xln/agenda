import { describe, expect, it } from "vitest";

import {
  campaignRunDisabledReason,
  canRunNextCampaign,
} from "./campaign-run-ui";

const base = {
  targetCount: 3,
  dailyLimitReached: false,
  withinWindow: true,
  locked: false,
};

describe("canRunNextCampaign", () => {
  it("allows when all gates pass", () => {
    expect(canRunNextCampaign(base)).toBe(true);
  });

  it("blocks with no targets", () => {
    expect(canRunNextCampaign({ ...base, targetCount: 0 })).toBe(false);
  });

  it("blocks when daily limit reached", () => {
    expect(canRunNextCampaign({ ...base, dailyLimitReached: true })).toBe(
      false,
    );
  });

  it("blocks outside send window", () => {
    expect(canRunNextCampaign({ ...base, withinWindow: false })).toBe(false);
  });

  it("blocks when plan locked", () => {
    expect(canRunNextCampaign({ ...base, locked: true })).toBe(false);
  });
});

describe("campaignRunDisabledReason", () => {
  it("returns null when locked (upgrade handles separately)", () => {
    expect(
      campaignRunDisabledReason({ ...base, targetCount: 0, locked: true }),
    ).toBe(null);
  });

  it("returns noTargets", () => {
    expect(
      campaignRunDisabledReason({ ...base, targetCount: 0 }),
    ).toBe("noTargets");
  });

  it("returns dailyLimitReached", () => {
    expect(
      campaignRunDisabledReason({ ...base, dailyLimitReached: true }),
    ).toBe("dailyLimitReached");
  });

  it("returns outsideWindow", () => {
    expect(
      campaignRunDisabledReason({ ...base, withinWindow: false }),
    ).toBe("outsideWindow");
  });
});
