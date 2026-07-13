import Link from "next/link";
import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PaidPlan } from "@/lib/plans";
import { formatTHB } from "@/lib/utils";

function FeatureRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <Check className="h-4 w-4 shrink-0 text-success" />
      {children}
    </li>
  );
}

export async function PricingPlanCard({ plan }: { plan: PaidPlan }) {
  const t = await getTranslations("landing.pricing");

  const coreFeatures = [
    t("features.campaigns", { count: plan.maxCampaigns }),
    t("features.targets", { count: plan.maxTargetsPerCampaign }),
    t("features.autoReplyRules", { count: plan.maxAutoReplyRules }),
    t("features.maxSendsPerDay", {
      count: plan.features.maxSendsPerDayCap,
      monthly: plan.features.maxSendsPerDayCap * 30,
    }),
    plan.features.maxTemplates !== null
      ? t("features.templates", { count: plan.features.maxTemplates })
      : t("features.templatesUnlimited"),
  ];

  return (
    <Card
      className={
        plan.highlighted ? "border-primary ring-1 ring-primary" : undefined
      }
    >
      <CardHeader>
        <CardTitle className="text-h2">{plan.name}</CardTitle>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-h1 font-bold">
            {formatTHB(plan.monthlyAmount)}
          </span>
          <span className="text-small text-muted-foreground">
            {t("perMonth")}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2 text-small">
          {coreFeatures.map((label) => (
            <FeatureRow key={label}>{label}</FeatureRow>
          ))}
        </ul>
        <details className="group rounded-md border border-border">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-small font-medium marker:content-none [&::-webkit-details-marker]:hidden">
            {t("showAllFeatures")}
          </summary>
          <ul className="space-y-2 border-t border-border px-3 pb-3 pt-2 text-small">
            <FeatureRow>
              {t("features.mediaAssets", { count: plan.maxMediaAssets })}
            </FeatureRow>
            <FeatureRow>
              {plan.features.schedulingCron
                ? t("features.schedulingCron")
                : t("features.unavailable")}
            </FeatureRow>
            <FeatureRow>
              {plan.features.autoReplyImages
                ? t("features.autoReplyImages")
                : t("features.unavailable")}
            </FeatureRow>
            <FeatureRow>
              {plan.features.autoReplyExcludeKeywords
                ? t("features.autoReplyFilters")
                : t("features.unavailable")}
            </FeatureRow>
            <FeatureRow>
              {plan.features.autoReplyExactMatch
                ? t("features.autoReplyExactMatch")
                : t("features.unavailable")}
            </FeatureRow>
            <FeatureRow>
              {plan.features.autoReplyPriority
                ? t("features.autoReplyPriority")
                : t("features.unavailable")}
            </FeatureRow>
            <FeatureRow>
              {plan.features.runHistoryDays === null
                ? t("features.runHistoryUnlimited")
                : t("features.runHistory", {
                    days: plan.features.runHistoryDays,
                  })}
            </FeatureRow>
            <FeatureRow>{t("features.pacing")}</FeatureRow>
          </ul>
        </details>
        <Button
          asChild
          variant={plan.highlighted ? "default" : "outline"}
          className="w-full"
        >
          <Link href="/signup">{t("cta")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
