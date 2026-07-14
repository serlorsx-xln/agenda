import { describe, expect, it } from "vitest";

import {
  formatCountdownHms,
  secondsUntilNextMidnightInTz,
} from "./timezone";

describe("timezone helpers", () => {
  it("formats countdown HMS", () => {
    expect(formatCountdownHms(0)).toBe("0:00");
    expect(formatCountdownHms(65)).toBe("1:05");
    expect(formatCountdownHms(3661)).toBe("1:01:01");
  });

  it("returns seconds until next Bangkok midnight", () => {
    // 2026-07-14 14:00:00 UTC+7
    const now = new Date("2026-07-14T07:00:00.000Z");
    const left = secondsUntilNextMidnightInTz("Asia/Bangkok", now);
    // 10 hours remaining → 36000
    expect(left).toBe(10 * 3600);
  });

  it("handles last second before midnight", () => {
    const now = new Date("2026-07-14T16:59:59.000Z"); // 23:59:59 +7
    expect(secondsUntilNextMidnightInTz("Asia/Bangkok", now)).toBe(1);
  });
});
