import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CampaignRow = {
  id: string;
  name: string;
  sentToday: number;
  maxSends: number;
  dailyRunId: string | null;
};

export async function CampaignProgressSummary({
  campaigns,
}: {
  campaigns: CampaignRow[];
}) {
  if (campaigns.length === 0) return null;

  const t = await getTranslations("dashboard.overview");
  const tc = await getTranslations("campaigns.card");
  // Prefer jobs with activity today so the overview looks informative.
  const shown = [...campaigns]
    .sort((a, b) => b.sentToday - a.sentToday || b.maxSends - a.maxSends)
    .slice(0, 3);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-h3">{t("campaignProgressTitle")}</CardTitle>
        <Link
          href="/dashboard/campaigns"
          className="text-caption text-primary hover:underline"
        >
          {t("viewAllCampaigns")}
        </Link>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => {
          const pct =
            c.maxSends > 0
              ? Math.min(100, Math.round((c.sentToday / c.maxSends) * 100))
              : 0;
          return (
            <div
              key={c.id}
              className="rounded-lg border border-border p-4 space-y-2"
            >
              <Link
                href={`/dashboard/campaigns/${c.id}`}
                className="block truncate font-medium hover:underline"
              >
                {c.name}
              </Link>
              <p className="text-caption text-muted-foreground">
                {tc("sentTodayShort", { sent: c.sentToday, max: c.maxSends })}
              </p>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={c.sentToday}
                aria-valuemin={0}
                aria-valuemax={c.maxSends}
              >
                <div
                  className={cn(
                    "h-full rounded-full bg-primary transition-all",
                    pct >= 100 && "bg-amber-500",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {c.dailyRunId ? (
                <Link
                  href={`/dashboard/runs/${c.dailyRunId}`}
                  className="inline-block text-caption text-primary hover:underline"
                >
                  {tc("viewToday")}
                </Link>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
