"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import type { UpgradeLimitType } from "@/lib/plan-usage-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PAID_PLANS } from "@/lib/plans";

export function UpgradeDialog({
  open,
  onOpenChange,
  limitType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limitType: UpgradeLimitType;
}) {
  const t = useTranslations("upgrade");
  const growth = PAID_PLANS.find((p) => p.id === "growth")!;

  if (limitType === "plan_locked") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("titleLocked")}</DialogTitle>
            <DialogDescription>{t("descriptionLocked")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("dismiss")}
            </Button>
            <Button asChild>
              <Link href="/dashboard/billing">{t("cta")}</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const titleKey =
    limitType === "campaigns"
      ? "titleCampaigns"
      : limitType === "targets"
        ? "titleTargets"
        : limitType === "auto_reply_rules"
          ? "titleAutoReplyRules"
          : limitType === "templates"
            ? "titleTemplates"
            : "titleMediaAssets";

  const descriptionKey =
    limitType === "campaigns"
      ? "descriptionCampaigns"
      : limitType === "targets"
        ? "descriptionTargets"
        : limitType === "auto_reply_rules"
          ? "descriptionAutoReplyRules"
          : limitType === "templates"
            ? "descriptionTemplates"
            : "descriptionMediaAssets";

  const count =
    limitType === "campaigns"
      ? growth.maxCampaigns
      : limitType === "targets"
        ? growth.maxTargetsPerCampaign
        : limitType === "auto_reply_rules"
          ? growth.maxAutoReplyRules
          : limitType === "templates"
            ? growth.features.maxTemplates ?? 0
            : growth.maxMediaAssets;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(descriptionKey, { count })}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-small text-muted-foreground">
          <li>{t("featureCampaigns", { count: growth.maxCampaigns })}</li>
          <li>
            {t("featureTargets", { count: growth.maxTargetsPerCampaign })}
          </li>
          <li>
            {t("featureAutoReplyRules", { count: growth.maxAutoReplyRules })}
          </li>
          <li>{t("featureMediaAssets", { count: growth.maxMediaAssets })}</li>
          <li>{t("featureScheduling")}</li>
          <li>{t("featureAutoReplyImages")}</li>
        </ul>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("dismiss")}
          </Button>
          <Button asChild>
            <Link href="/dashboard/billing">{t("cta")}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
