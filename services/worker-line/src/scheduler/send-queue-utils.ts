import type { Campaign } from "@line/db";
import {
  MIN_ACCOUNT_SEND_DELAY_SEC,
  MIN_PER_CHAT_COOLDOWN_SEC,
} from "@line/shared";

export {
  MIN_ACCOUNT_SEND_DELAY_SEC,
  MIN_PER_CHAT_COOLDOWN_SEC,
};
export const BACKOFF_LADDER_SEC = [120, 300, 900] as const;

export function currentHourInTz(timezone: string): number {
  const tz = timezone || "Asia/Bangkok";
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    });
    let hour = Number(fmt.format(new Date()));
    if (hour === 24) hour = 0;
    return hour;
  } catch {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      hour: "numeric",
      hour12: false,
    });
    let hour = Number(fmt.format(new Date()));
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

export function isWithinWindow(campaign: Pick<Campaign, "timezone" | "windowStartHour" | "windowEndHour">): boolean {
  const hour = currentHourInTz(campaign.timezone);
  return isHourWithinWindow(hour, campaign.windowStartHour, campaign.windowEndHour);
}

export function sameDayInTz(a: Date, b: Date, timezone: string): boolean {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(a) === fmt.format(b);
  } catch {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
}

export function statDateInTz(timezone: string, when = new Date()): string {
  const tz = timezone || "Asia/Bangkok";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(when);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(when);
  }
}

/** Seconds until end of sending window (or midnight for 24/7). */
export function remainingWindowSec(
  campaign: Pick<Campaign, "timezone" | "windowStartHour" | "windowEndHour">,
  now = new Date(),
): number {
  if (!isWithinWindow(campaign)) return 0;

  const { windowStartHour: start, windowEndHour: end, timezone } = campaign;

  if (start === end) {
    return secondsUntilMidnightInTz(timezone, now);
  }

  const hour = currentHourInTz(timezone);
  if (start < end) {
    const hoursLeft = Math.max(0, end - hour);
    return hoursLeft * 3600;
  }

  // Overnight window
  if (hour >= start) {
    return (24 - hour + end) * 3600;
  }
  return Math.max(0, end - hour) * 3600;
}

function secondsUntilMidnightInTz(timezone: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    const second = Number(parts.find((p) => p.type === "second")?.value ?? 0);
    const elapsed = hour * 3600 + minute * 60 + second;
    return Math.max(3600, 86400 - elapsed);
  } catch {
    return 86400;
  }
}

/** Account-level delay until the next group send (floor 5 min). */
export function computeDelaySec(
  delayBetweenTargetsSec: number,
  randomJitterSec: number,
  remainingSends: number,
  windowRemainingSec: number,
): number {
  const jitter = Math.floor(Math.random() * (randomJitterSec + 1));
  const userMin = Math.max(
    MIN_ACCOUNT_SEND_DELAY_SEC,
    delayBetweenTargetsSec + jitter,
  );
  const evenSpread =
    remainingSends > 0 && windowRemainingSec > 0
      ? windowRemainingSec / remainingSends
      : userMin;
  return Math.max(MIN_ACCOUNT_SEND_DELAY_SEC, userMin, evenSpread);
}

export function effectivePerChatCooldownSec(perChatCooldownSec: number): number {
  return Math.max(MIN_PER_CHAT_COOLDOWN_SEC, perChatCooldownSec);
}

export function chatCooldownRemainingSec(
  lastSentAt: Date | null | undefined,
  perChatCooldownSec: number,
  now: Date,
): number {
  if (!lastSentAt) return 0;
  const cooldown = effectivePerChatCooldownSec(perChatCooldownSec);
  const elapsed = (now.getTime() - lastSentAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(cooldown - elapsed));
}

export function accountCooldownRemainingSec(
  lastCampaignSendAt: Date | null | undefined,
  now: Date,
): number {
  if (!lastCampaignSendAt) return 0;
  const elapsed = (now.getTime() - lastCampaignSendAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(MIN_ACCOUNT_SEND_DELAY_SEC - elapsed));
}

export type ChatCooldownTarget = {
  lastSentAt: Date | null;
};

export type EligiblePick =
  | { ok: true; index: number }
  | { ok: false; earliestReadyAt: Date };

/** Walk rotation and pick the first chat past its per-chat cooldown. */
export function pickEligibleTargetIndex(
  targets: ChatCooldownTarget[],
  startIndex: number,
  perChatCooldownSec: number,
  now: Date,
): EligiblePick {
  if (targets.length === 0) {
    return { ok: false, earliestReadyAt: now };
  }

  let earliestReadyAt: Date | null = null;
  for (let offset = 0; offset < targets.length; offset++) {
    const index = (startIndex + offset) % targets.length;
    const remaining = chatCooldownRemainingSec(
      targets[index]!.lastSentAt,
      perChatCooldownSec,
      now,
    );
    if (remaining <= 0) {
      return { ok: true, index };
    }
    const readyAt = new Date(now.getTime() + remaining * 1000);
    if (!earliestReadyAt || readyAt.getTime() < earliestReadyAt.getTime()) {
      earliestReadyAt = readyAt;
    }
  }

  return { ok: false, earliestReadyAt: earliestReadyAt ?? now };
}

/** nextSendAt = max(account delay from now, earliest eligible chat). */
export function computeNextSendAt(
  now: Date,
  accountDelaySec: number,
  earliestChatReadyAt: Date | null,
): Date {
  const accountAt = new Date(now.getTime() + accountDelaySec * 1000);
  if (!earliestChatReadyAt) return accountAt;
  return accountAt.getTime() >= earliestChatReadyAt.getTime()
    ? accountAt
    : earliestChatReadyAt;
}

export function isRateLimitError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /rate|limit|throttl|too many|slow down|429|frequency|busy/.test(msg);
}

export function backoffSecondsForStreak(streak: number): number {
  if (streak <= 0) return BACKOFF_LADDER_SEC[0];
  const idx = Math.min(streak - 1, BACKOFF_LADDER_SEC.length - 1);
  return BACKOFF_LADDER_SEC[idx] ?? 900;
}

export type QueueCampaign = {
  id: string;
  userId: string;
  nextSendAt: Date | null;
  lastRunAt: Date | null;
};

/** Fair pick: earliest next_send_at, tie-break oldest last_run_at. */
export function pickNextCampaign<T extends QueueCampaign>(
  candidates: T[],
): T | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const aNext = a.nextSendAt?.getTime() ?? 0;
    const bNext = b.nextSendAt?.getTime() ?? 0;
    if (aNext !== bNext) return aNext - bNext;
    const aLast = a.lastRunAt?.getTime() ?? 0;
    const bLast = b.lastRunAt?.getTime() ?? 0;
    return aLast - bLast;
  })[0]!;
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

export function nextRotationIndex(
  currentIndex: number,
  targetCount: number,
): number {
  if (targetCount <= 0) return 0;
  return (currentIndex + 1) % targetCount;
}

export function shouldReuseDailyRun(
  existingCreatedAt: Date,
  now: Date,
  timezone: string,
): boolean {
  return sameDayInTz(existingCreatedAt, now, timezone);
}
