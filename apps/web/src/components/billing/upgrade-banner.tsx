"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import type { PlanUsageSnapshot } from "@/lib/plan-usage-types";
import { AbsoluteDeadlineCountdown } from "@/components/ui/daily-quota-reset-countdown";
import { Button } from "@/components/ui/button";

function dismissKey(kind: string) {
  return `upgrade-banner-dismiss:${kind}`;
}

export function UpgradeBanner({ usage }: { usage: PlanUsageSnapshot }) {
  const t = useTranslations("upgrade.banner");
  const [dismissed, setDismissed] = React.useState(true);

  const campaignRatio =
    usage.campaignsMax > 0 ? usage.campaignsUsed / usage.campaignsMax : 0;
  const trialEnding =
    usage.isOnTrial && usage.trialDaysLeft !== null && usage.trialDaysLeft <= 2;
  const nearCampaignLimit = campaignRatio >= 0.8 && campaignRatio < 1;
  const atCampaignLimit = usage.campaignsUsed >= usage.campaignsMax;

  let kind: "trial" | "near" | "limit" | null = null;
  if (trialEnding) kind = "trial";
  else if (atCampaignLimit) kind = "limit";
  else if (nearCampaignLimit) kind = "near";

  React.useEffect(() => {
    if (!kind) return;
    setDismissed(sessionStorage.getItem(dismissKey(kind)) === "1");
  }, [kind]);

  if (!kind || dismissed) return null;

  const message =
    kind === "trial"
      ? t("trialEnding", { days: usage.trialDaysLeft ?? 0 })
      : kind === "limit"
        ? t("atLimit")
        : t("nearLimit", {
            used: usage.campaignsUsed,
            max: usage.campaignsMax,
          });

  function dismiss() {
    if (kind) sessionStorage.setItem(dismissKey(kind), "1");
    setDismissed(true);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-small">{message}</p>
        {kind === "trial" && usage.trialEndsAt ? (
          <AbsoluteDeadlineCountdown endsAtIso={usage.trialEndsAt} />
        ) : null}
        {kind !== "trial" ? (
          <p className="text-caption text-muted-foreground">
            {t("planLimitHint")}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button asChild size="sm">
          <Link href="/dashboard/billing">{t("cta")}</Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={dismiss}
          aria-label={t("dismiss")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
