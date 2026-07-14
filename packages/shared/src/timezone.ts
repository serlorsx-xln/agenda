/** Default campaign timezone (matches DB column default). */
export const DEFAULT_CAMPAIGN_TIMEZONE = "Asia/Bangkok";

/**
 * Exact seconds until the next local midnight in `timezone`.
 * (Distinct from worker pacing which may clamp window remaining.)
 */
export function secondsUntilNextMidnightInTz(
  timezone: string,
  now = new Date(),
): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    }).formatToParts(now);
    let hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    if (hour === 24) hour = 0;
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    const second = Number(parts.find((p) => p.type === "second")?.value ?? 0);
    const elapsed = hour * 3600 + minute * 60 + second;
    return Math.max(0, 86400 - elapsed);
  } catch {
    const end = new Date(now);
    end.setHours(24, 0, 0, 0);
    return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
  }
}

/** Compact `Hh Mm Ss` / `Mm Ss` / `Ss` for countdown UI (locale-neutral digits). */
export function formatCountdownHms(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}
