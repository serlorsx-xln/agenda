import { describe, expect, it } from "vitest";

import { formatDate } from "./utils";

describe("formatDate", () => {
  it("formats in Asia/Bangkok regardless of UTC input", () => {
    // 2026-07-14 17:00 UTC = 2026-07-15 00:00 Bangkok
    const s = formatDate("2026-07-14T17:00:00.000Z", "en");
    expect(s).toMatch(/Jul/);
    expect(s).toMatch(/15/);
  });

  it("returns dash for invalid input", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate("not-a-date")).toBe("-");
  });
});
