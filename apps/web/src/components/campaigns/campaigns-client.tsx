"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  deleteCampaign,
  runCampaignNow,
  setCampaignEnabled,
} from "@/app/(dashboard)/dashboard/campaigns/actions";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { resolveActionError } from "@/lib/action-errors";
import {
  campaignRunDisabledReason,
  canRunNextCampaign,
} from "@/lib/campaign-run-ui";
import { IconDelete, IconEdit, IconPlus } from "@/lib/icons";
import type { PlanUsageSnapshot } from "@/lib/plan-usage-types";
import { cn } from "@/lib/utils";

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  enabled: boolean;
  targetCount: number;
  maxSends: number;
  sentToday: number;
  nextTargetName: string | null;
  dailyRunId: string | null;
  withinWindow: boolean;
  dailyLimitReached: boolean;
};

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "muted" | "secondary"
> = {
  active: "success",
  paused: "warning",
  draft: "muted",
  archived: "secondary",
};

type PendingAction = { type: "run" | "delete"; id: string };

function progressPercent(sent: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((sent / max) * 100));
}

export function CampaignsClient({
  campaigns,
  planUsage,
}: {
  campaigns: CampaignRow[];
  planUsage: PlanUsageSnapshot;
}) {
  const t = useTranslations("campaigns");
  const te = useTranslations("campaigns.errors");
  const ts = useTranslations("campaigns.status");
  const tc = useTranslations("common");
  const tt = useTranslations("toast");
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [upgradeLimit, setUpgradeLimit] =
    React.useState<"campaigns" | "plan_locked">("campaigns");
  const [pending, setPending] = React.useState<PendingAction | null>(null);

  const locked = planUsage.isLocked;
  const atCampaignLimit = planUsage.campaignsUsed >= planUsage.campaignsMax;

  function handlePlanLimit(code: string) {
    if (code === "plan_locked") {
      setUpgradeLimit("plan_locked");
      setUpgradeOpen(true);
      return true;
    }
    return false;
  }

  async function toggle(id: string, enabled: boolean) {
    setBusy(id);
    try {
      await setCampaignEnabled(id, enabled);
      router.refresh();
    } catch {
      toast.error(tt("error"));
    } finally {
      setBusy(null);
    }
  }

  async function runConfirmed(id: string) {
    setBusy(id);
    try {
      const res = await runCampaignNow(id);
      if (!res.ok) {
        if (handlePlanLimit(res.error ?? "")) return;
        toast.error(resolveActionError(te, res.error, tt("error")));
        return;
      }
      if (res.dailyRunId) {
        toast.success(t("runNextSuccess"), {
          action: {
            label: t("card.viewToday"),
            onClick: () => router.push(`/dashboard/runs/${res.dailyRunId}`),
          },
        });
      } else {
        toast.success(t("runNextSuccess"));
      }
      router.refresh();
    } catch {
      toast.error(tt("error"));
    } finally {
      setBusy(null);
    }
  }

  async function removeConfirmed(id: string) {
    setBusy(id);
    try {
      await deleteCampaign(id);
      toast.success(tt("deleted"));
      router.refresh();
    } catch {
      toast.error(tt("error"));
    } finally {
      setBusy(null);
    }
  }

  async function handleConfirm() {
    if (!pending) return;
    if (pending.type === "run") await runConfirmed(pending.id);
    else await removeConfirmed(pending.id);
    setPending(null);
  }

  function canRunNext(c: CampaignRow): boolean {
    return canRunNextCampaign({
      targetCount: c.targetCount,
      dailyLimitReached: c.dailyLimitReached,
      withinWindow: c.withinWindow,
      locked,
    });
  }

  function runDisabledReason(c: CampaignRow): string | null {
    const key = campaignRunDisabledReason({
      targetCount: c.targetCount,
      dailyLimitReached: c.dailyLimitReached,
      withinWindow: c.withinWindow,
      locked,
    });
    if (!key) return null;
    return t(`progress.${key}`);
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-muted-foreground">
          {t("usageSummary", {
            used: planUsage.campaignsUsed,
            max: planUsage.campaignsMax,
          })}
        </p>
        {locked || atCampaignLimit ? (
          <Button
            onClick={() => {
              setUpgradeLimit(locked ? "plan_locked" : "campaigns");
              setUpgradeOpen(true);
            }}
            title={locked ? undefined : t("limitReached")}
          >
            <IconPlus className="h-4 w-4" />
            {t("new")}
          </Button>
        ) : (
          <Button asChild>
            <Link href="/dashboard/campaigns/new">
              <IconPlus className="h-4 w-4" />
              {t("new")}
            </Link>
          </Button>
        )}
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-small text-muted-foreground">{t("empty")}</p>
            {locked || atCampaignLimit ? (
              <Button
                size="touch"
                onClick={() => {
                  setUpgradeLimit(locked ? "plan_locked" : "campaigns");
                  setUpgradeOpen(true);
                }}
              >
                {t("emptyCta")}
              </Button>
            ) : (
              <Button asChild size="touch">
                <Link href="/dashboard/campaigns/new">{t("emptyCta")}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => {
            const runReason = runDisabledReason(c);
            const pct = progressPercent(c.sentToday, c.maxSends);
            return (
              <Card key={c.id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-h3 font-bold">{c.name}</h3>
                        <Badge variant={STATUS_VARIANT[c.status] ?? "muted"}>
                          {ts(c.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-caption text-muted-foreground">
                        {t("card.summary", {
                          groups: c.targetCount,
                          max: c.maxSends,
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <Link
                          href={`/dashboard/campaigns/${c.id}`}
                          aria-label={tc("edit")}
                        >
                          <IconEdit className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setPending({ type: "delete", id: c.id })
                        }
                        disabled={busy === c.id}
                        aria-label={tc("delete")}
                      >
                        <IconDelete className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {c.targetCount > 0 ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-small">
                        <span className="font-medium">
                          {t("card.sentTodayShort", {
                            sent: c.sentToday,
                            max: c.maxSends,
                          })}
                        </span>
                        {c.nextTargetName ? (
                          <span className="truncate text-muted-foreground">
                            {t("progress.nextGroup", {
                              name: c.nextTargetName,
                            })}
                          </span>
                        ) : null}
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={c.sentToday}
                        aria-valuemin={0}
                        aria-valuemax={c.maxSends}
                        aria-label={t("progress.sentToday", {
                          sent: c.sentToday,
                          max: c.maxSends,
                        })}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full bg-primary transition-all",
                            pct >= 100 && "bg-amber-500",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {runReason ? (
                        <p className="text-caption text-amber-700 dark:text-amber-400">
                          {runReason}
                        </p>
                      ) : null}
                      {c.dailyRunId ? (
                        <Link
                          href={`/dashboard/runs/${c.dailyRunId}`}
                          className="inline-block text-caption text-primary hover:underline"
                        >
                          {t("card.viewToday")}
                        </Link>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-caption text-muted-foreground">
                      {t("progress.noTargets")}
                    </p>
                  )}

                  <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex min-h-9 cursor-pointer items-center gap-2">
                      <Switch
                        checked={c.enabled}
                        onCheckedChange={(v) => toggle(c.id, v)}
                        disabled={busy === c.id || locked}
                        aria-label={t("card.autoSend")}
                      />
                      <span className="text-small">{t("card.autoSend")}</span>
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => setPending({ type: "run", id: c.id })}
                      disabled={busy === c.id || !canRunNext(c)}
                      title={runReason ?? t("hints.runNext")}
                    >
                      {t("runNext")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={
          pending?.type === "run"
            ? t("runNextConfirmTitle")
            : t("deleteConfirmTitle")
        }
        description={
          pending?.type === "run"
            ? (() => {
                const c = campaigns.find((x) => x.id === pending.id);
                return c?.nextTargetName
                  ? t("runNextConfirmNamed", {
                      name: c.nextTargetName,
                    })
                  : t("runNextConfirm");
              })()
            : t("deleteConfirm")
        }
        confirmLabel={pending?.type === "run" ? t("runNext") : tc("delete")}
        cancelLabel={tc("cancel")}
        variant={pending?.type === "delete" ? "destructive" : "default"}
        loading={pending !== null && busy === pending.id}
        onConfirm={handleConfirm}
      />

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        limitType={upgradeLimit}
        trialStarted={planUsage.trialStarted}
      />
    </>
  );
}
