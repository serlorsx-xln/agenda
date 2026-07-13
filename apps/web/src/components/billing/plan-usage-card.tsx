import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { PlanUsageSnapshot } from "@/lib/plan-usage-types";
import { FieldHint } from "@/components/ui/field-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function UsageBar({
  used,
  max,
  label,
}: {
  used: number;
  max: number;
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const nearLimit = pct >= 80;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-small">
        <span className="text-muted-foreground">{label}</span>
        <span className={nearLimit ? "font-medium text-warning" : ""}>
          {used} / {max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${
            nearLimit ? "bg-warning" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export async function PlanUsageCard({
  usage,
}: {
  usage: PlanUsageSnapshot;
}) {
  const t = await getTranslations("planUsage");

  const atAnyLimit =
    usage.campaignsUsed >= usage.campaignsMax ||
    usage.autoReplyRulesUsed >= usage.autoReplyRulesMax ||
    usage.mediaAssetsUsed >= usage.mediaAssetsMax;

  const showUpgrade =
    usage.isLocked ||
    atAnyLimit ||
    (usage.isOnTrial && (usage.trialDaysLeft ?? 0) <= 2);

  const showStats =
    usage.sentToday > 0 || usage.autoReplyMatchesTotal > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-h3">{t("title")}</CardTitle>
        <div className="flex items-center gap-2">
          {usage.isLocked && (
            <Badge variant="warning">{t("lockedBadge")}</Badge>
          )}
          {usage.isOnTrial && (
            <Badge variant="secondary">
              {t("trialBadge", { days: usage.trialDaysLeft ?? 0 })}
            </Badge>
          )}
          <Badge variant="outline">{usage.planName}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {usage.isLocked && (
          <p className="text-small text-muted-foreground">{t("lockedHint")}</p>
        )}
        {!usage.connected && (
          <p className="text-small text-muted-foreground">
            {usage.isOnTrial
              ? t("connectHintTrial")
              : usage.isLocked
                ? t("connectHintLocked")
                : t("connectHint")}
          </p>
        )}

        <div className="space-y-3">
          <p className="text-caption font-medium text-muted-foreground">
            {t("limitsSection")}
          </p>
          <UsageBar
            used={usage.campaignsUsed}
            max={usage.campaignsMax}
            label={t("campaigns")}
          />
          <UsageBar
            used={usage.autoReplyRulesUsed}
            max={usage.autoReplyRulesMax}
            label={t("autoReplyRules")}
          />
          <UsageBar
            used={usage.mediaAssetsUsed}
            max={usage.mediaAssetsMax}
            label={t("mediaAssets")}
          />
        </div>

        {showStats ? (
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-caption font-medium text-muted-foreground">
              {t("statsSection")}
            </p>
            {usage.sentToday > 0 ? (
              <p className="text-caption text-muted-foreground">
                {t("sentToday", { count: usage.sentToday })}
              </p>
            ) : null}
            {usage.autoReplyMatchesTotal > 0 ? (
              <p className="text-caption text-muted-foreground">
                {t("autoReplyMatches", { count: usage.autoReplyMatchesTotal })}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1 border-t border-border pt-3">
          <div className="flex items-center gap-1.5">
            <p className="text-caption font-medium text-muted-foreground">
              {t("perJobSection")}
            </p>
            <FieldHint content={t("maxSendsPerJobHint")} />
          </div>
          <p className="text-caption text-muted-foreground">
            {t("targetsPerCampaign", { count: usage.maxTargetsPerCampaign })}
          </p>
          <p className="text-caption text-muted-foreground">
            {t("maxSendsPerJob", {
              count: usage.features.maxSendsPerDayCap,
            })}
          </p>
        </div>

        {showUpgrade && (
          <Button asChild size="sm" variant={usage.isLocked ? "default" : "outline"}>
            <Link href="/dashboard/billing">
              {usage.isLocked ? t("unlockCta") : t("upgradeCta")}
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
