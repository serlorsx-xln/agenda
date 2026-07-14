"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import {
  DEFAULT_CAMPAIGN_TIMEZONE,
  formatCountdownHms,
  secondsUntilNextMidnightInTz,
} from "@line/shared/timezone";
import { cn } from "@/lib/utils";

export function DailyQuotaResetCountdown({
  timezone = DEFAULT_CAMPAIGN_TIMEZONE,
  className,
}: {
  timezone?: string;
  className?: string;
}) {
  const t = useTranslations("common.quota");
  const [remainingSec, setRemainingSec] = React.useState(() =>
    secondsUntilNextMidnightInTz(timezone),
  );

  React.useEffect(() => {
    const tick = () => setRemainingSec(secondsUntilNextMidnightInTz(timezone));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [timezone]);

  return (
    <p className={cn("text-caption text-muted-foreground tabular-nums", className)}>
      {t("resetsIn", { time: formatCountdownHms(remainingSec) })}
    </p>
  );
}

/** Absolute deadline countdown (e.g. trial end). */
export function AbsoluteDeadlineCountdown({
  endsAtIso,
  className,
}: {
  endsAtIso: string;
  className?: string;
}) {
  const t = useTranslations("common.quota");
  const endsAtMs = Date.parse(endsAtIso);
  const [remainingSec, setRemainingSec] = React.useState(() =>
    Number.isFinite(endsAtMs)
      ? Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000))
      : 0,
  );

  React.useEffect(() => {
    if (!Number.isFinite(endsAtMs)) return;
    const tick = () =>
      setRemainingSec(Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAtMs]);

  if (!Number.isFinite(endsAtMs)) return null;

  return (
    <p className={cn("text-caption text-muted-foreground tabular-nums", className)}>
      {t("endsIn", { time: formatCountdownHms(remainingSec) })}
    </p>
  );
}

/** Plan seats / rules / media: no calendar reset. */
export function PlanLimitNoDailyReset({ className }: { className?: string }) {
  const t = useTranslations("common.quota");
  return (
    <p className={cn("text-caption text-muted-foreground", className)}>
      {t("noDailyReset")}
    </p>
  );
}
