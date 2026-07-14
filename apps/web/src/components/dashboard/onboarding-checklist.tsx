"use client";

import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { OnboardingProgress } from "@/lib/plan-usage-types";

const STEPS = [
  { key: "connect", href: "/dashboard/connect", field: "connected" },
  { key: "sync", href: "/dashboard/openchats", field: "hasSyncedChats" },
  { key: "template", href: "/dashboard/templates", field: "hasTemplate" },
  {
    key: "autoReply",
    href: "/dashboard/auto-reply",
    field: "hasAutoReply",
    optional: true,
  },
  { key: "campaign", href: "/dashboard/campaigns", field: "hasCampaign" },
  { key: "run", href: "/dashboard/campaigns", field: "hasRun" },
] as const;

const REQUIRED_FIELDS = [
  "connected",
  "hasSyncedChats",
  "hasTemplate",
  "hasCampaign",
  "hasRun",
] as const;

export function OnboardingChecklist({
  progress,
}: {
  progress: OnboardingProgress;
}) {
  const t = useTranslations("onboarding");

  const requiredDone = REQUIRED_FIELDS.every(
    (field) => progress[field as keyof OnboardingProgress],
  );

  if (requiredDone) return null;

  const doneCount = REQUIRED_FIELDS.filter(
    (field) => progress[field as keyof OnboardingProgress],
  ).length;

  const nextStep =
    STEPS.find(
      (s) =>
        !("optional" in s && s.optional) &&
        !progress[s.field as keyof OnboardingProgress],
    ) ??
    STEPS.find(
      (s) =>
        "optional" in s &&
        s.optional &&
        !progress[s.field as keyof OnboardingProgress],
    );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-h3">{t("title")}</CardTitle>
        <p className="text-small text-muted-foreground">
          {t("progress", { done: doneCount, total: REQUIRED_FIELDS.length })}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2">
          {STEPS.map((step, i) => {
            const done = progress[step.field as keyof OnboardingProgress];
            const optional = "optional" in step && step.optional;
            return (
              <li
                key={step.key}
                className={cn(
                  "flex items-start gap-3 rounded-md px-2 py-1.5 text-small",
                  !done && nextStep?.key === step.key && "bg-muted/50",
                )}
              >
                {done ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      done ? "text-muted-foreground line-through" : ""
                    }
                  >
                    {i + 1}. {t(`steps.${step.key}`)}
                  </span>
                  {optional ? (
                    <Badge variant="secondary" className="text-caption">
                      {t("optional")}
                    </Badge>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        {nextStep && (
          <Button asChild size="touch" className="w-full sm:w-auto">
            <Link href={nextStep.href}>{t(`cta.${nextStep.key}`)}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
