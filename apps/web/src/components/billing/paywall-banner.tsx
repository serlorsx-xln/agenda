import Link from "next/link";
import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PlanUsageSnapshot } from "@/lib/plan-usage-types";

export async function PaywallBanner({
  usage,
}: {
  usage: PlanUsageSnapshot;
}) {
  if (!usage.isLocked) return null;

  const t = await getTranslations("paywall");

  return (
    <Card className="mb-6 border-destructive/40 bg-destructive/5">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold">{t("title")}</p>
            <p className="mt-1 text-small text-muted-foreground">
              {t("description")}
            </p>
          </div>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/dashboard/billing">{t("cta")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
