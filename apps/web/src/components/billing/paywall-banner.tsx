"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PlanUsageSnapshot } from "@/lib/plan-usage-types";

export function PaywallBanner({ usage }: { usage: PlanUsageSnapshot }) {
  const t = useTranslations("paywall");
  const pathname = usePathname();

  if (!usage.isLocked) return null;
  // Billing page is already the destination - avoid a second “pay now” alert.
  if (pathname.startsWith("/dashboard/billing")) return null;

  return (
    <Card className="mb-6 border-warning/35 bg-warning/5">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
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
