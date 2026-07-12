import Link from "next/link";
import { Activity, MessageSquare } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { CampaignProgressSummary } from "@/components/dashboard/campaign-progress-summary";
import { PlanUsageCard } from "@/components/billing/plan-usage-card";
import { UpgradeBanner } from "@/components/billing/upgrade-banner";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  ConnectionBadge,
  RunStatusBadge,
} from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOnboardingProgress, getOverviewStats, getRecentRuns } from "@/lib/db-helpers";
import { getCampaignsWithProgress } from "@/lib/queries";
import {
  IconAutoReply,
  IconConnect,
  IconSend,
} from "@/lib/icons";
import { getPlanUsage } from "@/lib/plan-limits";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export default async function OverviewPage() {
  const user = await requireUser();
  const t = await getTranslations("dashboard.overview");
  const tc = await getTranslations("connect.status");
  const tr = await getTranslations("runs.status");
  const locale = await getLocale();

  const [stats, recentRuns, planUsage, onboarding, campaigns] = await Promise.all([
    getOverviewStats(user.id),
    getRecentRuns(user.id),
    getPlanUsage(user.id),
    getOnboardingProgress(user.id),
    getCampaignsWithProgress(user.id),
  ]);

  const notConnected = stats.connectionStatus !== "connected";
  const onboardingComplete =
    onboarding.connected &&
    onboarding.hasSyncedChats &&
    onboarding.hasTemplate &&
    onboarding.hasCampaign &&
    onboarding.hasRun;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {notConnected && (
        <Card className="border-primary/30 bg-muted/40">
          <CardContent className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <IconConnect className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
              <p className="text-small">{t("connectPrompt")}</p>
            </div>
            <Button asChild size="sm">
              <Link href="/dashboard/connect">{t("connectCta")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <OnboardingChecklist progress={onboarding} />

      {campaigns.length > 0 ? (
        <CampaignProgressSummary
          campaigns={campaigns.map((c) => ({
            id: c.id,
            name: c.name,
            sentToday: c.sentToday,
            maxSends: c.maxSends,
            dailyRunId: c.dailyRunId,
          }))}
        />
      ) : null}

      {onboardingComplete && (
        <>
          <UpgradeBanner usage={planUsage} />
          <PlanUsageCard usage={planUsage} />
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label={t("connection")}
          icon={IconConnect}
          value={
            <ConnectionBadge
              status={stats.connectionStatus}
              label={tc(stats.connectionStatus)}
            />
          }
        />
        <MetricCard
          label={t("activeCampaigns")}
          icon={IconSend}
          value={stats.activeCampaigns}
        />
        <MetricCard
          label={t("quota")}
          icon={MessageSquare}
          value={stats.sentToday}
        />
        {onboardingComplete ? (
          <>
            <MetricCard
              label={t("recentRuns")}
              icon={Activity}
              value={stats.runsLast7Days}
            />
            <MetricCard
              label={t("autoReplyRules")}
              icon={IconAutoReply}
              value={stats.autoReplyRuleCount}
            />
          </>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">{t("recentActivity")}</CardTitle>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <p className="py-8 text-center text-small text-muted-foreground">
              {t("noActivity")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recentRuns.map((run) => (
                <li
                  key={run.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium">
                      {run.campaignName}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {formatDate(run.createdAt, locale)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-caption text-muted-foreground">
                      {run.sentCount} / {run.sentCount + run.failedCount}
                    </span>
                    <RunStatusBadge
                      status={run.status}
                      label={tr(run.status)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
