import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../line/manager.js", () => ({
  lineManager: {},
}));

import {
  anyRunning,
  cancelRun,
  isRunCancelled,
  isHourWithinWindow,
  isWithinWindow,
  resetRunCancellation,
} from "./runner.js";

describe("campaign runner", () => {
  describe("isHourWithinWindow", () => {
    it("treats equal start/end as always open", () => {
      expect(isHourWithinWindow(3, 9, 9)).toBe(true);
      expect(isHourWithinWindow(23, 0, 0)).toBe(true);
    });

    it("handles same-day windows", () => {
      expect(isHourWithinWindow(10, 9, 17)).toBe(true);
      expect(isHourWithinWindow(8, 9, 17)).toBe(false);
      expect(isHourWithinWindow(17, 9, 17)).toBe(false);
    });

    it("handles overnight windows", () => {
      expect(isHourWithinWindow(23, 22, 6)).toBe(true);
      expect(isHourWithinWindow(3, 22, 6)).toBe(true);
      expect(isHourWithinWindow(12, 22, 6)).toBe(false);
    });
  });

  describe("isWithinWindow", () => {
    it("delegates to timezone hour resolution", () => {
      const campaign = {
        timezone: "UTC",
        windowStartHour: 9,
        windowEndHour: 17,
      } as never;
      vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
        () =>
          ({
            format: () => "10",
          }) as Intl.DateTimeFormat,
      );
      expect(isWithinWindow(campaign)).toBe(true);
      vi.restoreAllMocks();
    });
  });

  describe("run cancellation", () => {
    beforeEach(() => {
      resetRunCancellation();
    });

    it("tracks cancelled runs for the send queue", () => {
      expect(anyRunning()).toBe(false);
      expect(isRunCancelled("run-1")).toBe(false);
      cancelRun("run-1");
      expect(isRunCancelled("run-1")).toBe(true);
    });
  });
});
