import { describe, expect, it } from "vitest";

import {
  cronFromSchedule,
  isAllowedCronExpr,
  scheduleFromCron,
} from "./campaign-schedule";

describe("campaign-schedule", () => {
  it("maps window preset to null cron", () => {
    expect(
      cronFromSchedule({ preset: "window", hour: 10, minute: 0 }),
    ).toBeNull();
  });

  it("builds daily and weekdays course expressions", () => {
    expect(
      cronFromSchedule({ preset: "daily", hour: 10, minute: 0 }),
    ).toBe("0 10 * * *");
    expect(
      cronFromSchedule({ preset: "weekdays", hour: 9, minute: 30 }),
    ).toBe("30 9 * * 1-5");
  });

  it("round-trips daily and weekdays", () => {
    expect(scheduleFromCron("0 10 * * *")).toEqual({
      preset: "daily",
      hour: 10,
      minute: 0,
    });
    expect(scheduleFromCron("15 14 * * 1-5")).toEqual({
      preset: "weekdays",
      hour: 14,
      minute: 15,
    });
    expect(scheduleFromCron(null)).toEqual({
      preset: "window",
      hour: 10,
      minute: 0,
    });
  });

  it("rejects free-form cron", () => {
    expect(isAllowedCronExpr("*/5 * * * *")).toBe(false);
    expect(isAllowedCronExpr("0 10 * * *")).toBe(true);
    expect(isAllowedCronExpr(null)).toBe(true);
  });

  it("falls back unknown legacy cron to window", () => {
    expect(scheduleFromCron("*/15 * * * *")).toEqual({
      preset: "window",
      hour: 10,
      minute: 0,
    });
  });
});
