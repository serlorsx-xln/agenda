/** Campaign send window + rotation helpers (mirrors worker send-queue-utils). */

export function statDateInTz(timezone: string, when = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(when);
  } catch {
    return when.toISOString().slice(0, 10);
  }
}

export function currentHourInTz(timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    return Number(fmt.format(new Date()));
  } catch {
    return new Date().getHours();
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
