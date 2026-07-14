/** Campaign send window + rotation helpers (mirrors worker send-queue-utils). */

import { DEFAULT_CAMPAIGN_TIMEZONE } from "@line/shared/timezone";

export function statDateInTz(timezone: string, when = new Date()): string {
  const tz = timezone || DEFAULT_CAMPAIGN_TIMEZONE;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(when);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_CAMPAIGN_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(when);
  }
}

export function currentHourInTz(timezone: string, when = new Date()): number {
  const tz = timezone || DEFAULT_CAMPAIGN_TIMEZONE;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    });
    let hour = Number(fmt.format(when));
    if (hour === 24) hour = 0;
    return hour;
  } catch {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: DEFAULT_CAMPAIGN_TIMEZONE,
      hour: "numeric",
      hour12: false,
    });
    let hour = Number(fmt.format(when));
    if (hour === 24) hour = 0;
    return hour;
  }
}

export function isHourWithinWindow(
  hour: number,
  start: number,
  end: number,
): boolean {
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function isWithinWindow(campaign: {
  timezone: string;
  windowStartHour: number;
  windowEndHour: number;
}): boolean {
  const hour = currentHourInTz(campaign.timezone);
  return isHourWithinWindow(
    hour,
    campaign.windowStartHour,
    campaign.windowEndHour,
  );
}

export function rotationIndexAt(
  sendRotationIndex: number,
  targetCount: number,
): number {
  if (targetCount <= 0) return 0;
  return (
    (((sendRotationIndex ?? 0) % targetCount) + targetCount) % targetCount
  );
}
