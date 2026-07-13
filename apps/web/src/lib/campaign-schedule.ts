/**
 * User-facing campaign schedules map to a small set of cron expressions
 * stored in `campaigns.cron_expr`. Users never type cron themselves.
 */

export type SchedulePreset = "window" | "daily" | "weekdays";

export type CampaignSchedule = {
  preset: SchedulePreset;
  /** 0-23 when preset is daily/weekdays */
  hour: number;
  /** 0-59 when preset is daily/weekdays */
  minute: number;
};

const DEFAULT_HOUR = 10;
const DEFAULT_MINUTE = 0;

const DAILY_RE = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/;
const WEEKDAYS_RE = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+1-5$/;

function clampHour(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_HOUR;
  return Math.min(23, Math.max(0, Math.trunc(n)));
}

function clampMinute(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MINUTE;
  return Math.min(59, Math.max(0, Math.trunc(n)));
}

/** Build the cron expression for a schedule preset, or null for window-only. */
export function cronFromSchedule(schedule: CampaignSchedule): string | null {
  if (schedule.preset === "window") return null;
  const minute = clampMinute(schedule.minute);
  const hour = clampHour(schedule.hour);
  if (schedule.preset === "weekdays") {
    return `${minute} ${hour} * * 1-5`;
  }
  return `${minute} ${hour} * * *`;
}

/** Parse a stored cron expression back into the simple schedule UI. */
export function scheduleFromCron(
  cronExpr: string | null | undefined,
): CampaignSchedule {
  const expr = cronExpr?.trim() ?? "";
  if (!expr) {
    return { preset: "window", hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
  }

  let match = expr.match(DAILY_RE);
  if (match) {
    return {
      preset: "daily",
      minute: clampMinute(Number(match[1])),
      hour: clampHour(Number(match[2])),
    };
  }

  match = expr.match(WEEKDAYS_RE);
  if (match) {
    return {
      preset: "weekdays",
      minute: clampMinute(Number(match[1])),
      hour: clampHour(Number(match[2])),
    };
  }

  // Unknown legacy expression: fall back to once-per-day-in-window.
  return { preset: "window", hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
}

/** True when the expression is one we generate (or empty/null). */
export function isAllowedCronExpr(
  cronExpr: string | null | undefined,
): boolean {
  if (cronExpr == null) return true;
  const expr = cronExpr.trim();
  if (!expr) return true;
  return DAILY_RE.test(expr) || WEEKDAYS_RE.test(expr);
}

export function normalizeCronExpr(
  cronExpr: string | null | undefined,
): string | null {
  if (cronExpr == null) return null;
  const expr = cronExpr.trim();
  if (!expr) return null;
  return isAllowedCronExpr(expr) ? expr : null;
}
