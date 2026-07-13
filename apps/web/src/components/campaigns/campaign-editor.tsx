"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createCampaign,
  deleteCampaign,
  runCampaignNow,
  setCampaignTargets,
  updateCampaign,
} from "@/app/(dashboard)/dashboard/campaigns/actions";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldHint, FieldLabel } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { resolveActionError } from "@/lib/action-errors";
import {
  DEFAULT_PER_CHAT_COOLDOWN_SEC,
  DEFAULT_SEND_DELAY_SEC,
  DEFAULT_SEND_JITTER_SEC,
  MIN_ACCOUNT_SEND_DELAY_SEC,
  MIN_PER_CHAT_COOLDOWN_SEC,
} from "@line/shared/pacing";
import {
  campaignRunDisabledReason,
  canRunNextCampaign,
} from "@/lib/campaign-run-ui";
import {
  cronFromSchedule,
  scheduleFromCron,
  type SchedulePreset,
} from "@/lib/campaign-schedule";
import { IconLoader } from "@/lib/icons";
import type { PlanUsageSnapshot, UpgradeLimitType } from "@/lib/plan-usage-types";

type TemplateOption = {
  id: string;
  name: string;
  body: string | null;
  imageAssetIds?: string[];
};
type ChatOption = { chatMid: string; name: string; present: boolean };

export type CampaignRunProgress = {
  targetCount: number;
  maxSends: number;
  sentToday: number;
  nextTargetName: string | null;
  dailyRunId: string | null;
  withinWindow: boolean;
  dailyLimitReached: boolean;
};

export type CampaignInitial = {
  id: string;
  name: string;
  templateId: string | null;
  timezone: string;
  windowStartHour: number;
  windowEndHour: number;
  cronExpr: string | null;
  maxSends: number;
  delayBetweenTargetsSec: number;
  perChatCooldownSec: number;
  randomJitterSec: number;
  autoStopOnErrors: number;
  enabled: boolean;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const BASE_MINUTES = [0, 15, 30, 45];
const SCHEDULE_PRESETS: SchedulePreset[] = ["window", "daily", "weekdays"];

function allowedSchedulePresets(planUsage: PlanUsageSnapshot): SchedulePreset[] {
  if (planUsage.features.schedulingCron) return SCHEDULE_PRESETS;
  return ["window"];
}

export function CampaignEditor({
  templates,
  chats,
  initial,
  initialTargets,
  planUsage,
  runProgress,
}: {
  templates: TemplateOption[];
  chats: ChatOption[];
  initial?: CampaignInitial;
  initialTargets?: string[];
  planUsage: PlanUsageSnapshot;
  runProgress?: CampaignRunProgress | null;
}) {
  const t = useTranslations("campaigns");
  const te = useTranslations("campaigns.errors");
  const tc = useTranslations("common");
  const tt = useTranslations("toast");
  const router = useRouter();

  const maxTargets = planUsage.maxTargetsPerCampaign;
  const maxSendsCap = planUsage.features.maxSendsPerDayCap;
  const schedulePresets = allowedSchedulePresets(planUsage);
  const locked = planUsage.isLocked;

  const [name, setName] = React.useState(initial?.name ?? "");
  const [templateId, setTemplateId] = React.useState(
    initial?.templateId ?? templates[0]?.id ?? "",
  );
  const [timezone] = React.useState(initial?.timezone ?? "Asia/Bangkok");
  const [windowStartHour, setWindowStart] = React.useState(
    initial?.windowStartHour ?? 9,
  );
  const [windowEndHour, setWindowEnd] = React.useState(
    initial?.windowEndHour ?? 21,
  );
  const initialSchedule = scheduleFromCron(initial?.cronExpr);
  const [schedulePreset, setSchedulePreset] = React.useState<SchedulePreset>(
    initialSchedule.preset,
  );
  const [scheduleHour, setScheduleHour] = React.useState(initialSchedule.hour);
  const [scheduleMinute, setScheduleMinute] = React.useState(
    initialSchedule.minute,
  );
  const minuteOptions = React.useMemo(() => {
    const opts = new Set(BASE_MINUTES);
    opts.add(scheduleMinute);
    return [...opts].sort((a, b) => a - b);
  }, [scheduleMinute]);

  const [maxSends, setMaxSends] = React.useState(
    initial?.maxSends ?? Math.min(100, maxSendsCap || 100),
  );
  const [delayMinutes, setDelayMinutes] = React.useState(
    Math.max(
      MIN_ACCOUNT_SEND_DELAY_SEC / 60,
      Math.round(
        (initial?.delayBetweenTargetsSec ?? DEFAULT_SEND_DELAY_SEC) / 60,
      ),
    ),
  );
  const [perChatMinutes, setPerChatMinutes] = React.useState(
    Math.max(
      MIN_PER_CHAT_COOLDOWN_SEC / 60,
      Math.round(
        (initial?.perChatCooldownSec ?? DEFAULT_PER_CHAT_COOLDOWN_SEC) / 60,
      ),
    ),
  );
  const [jitter, setJitter] = React.useState(
    initial?.randomJitterSec ?? DEFAULT_SEND_JITTER_SEC,
  );
  const [autoStop, setAutoStop] = React.useState(
    initial?.autoStopOnErrors ?? 3,
  );
  const [enabled, setEnabled] = React.useState(initial?.enabled ?? false);
  const [targets, setTargets] = React.useState<Set<string>>(
    new Set(initialTargets ?? []),
  );
  const [saving, setSaving] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [runConfirmOpen, setRunConfirmOpen] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [upgradeLimit, setUpgradeLimit] =
    React.useState<UpgradeLimitType>("targets");

  const targetCount = targets.size;
  const hasCronSchedule = schedulePreset !== "window";
  const sendsPerGroupEstimate =
    targetCount > 0 ? Math.floor(maxSends / targetCount) : 0;
  const showUnequalWarning = targetCount > 0 && maxSends < targetCount;
  const roundEstimateMinutes =
    targetCount > 0 ? targetCount * delayMinutes : 0;

  function toggleTarget(mid: string) {
    setTargets((prev) => {
      const next = new Set(prev);
      if (next.has(mid)) {
        next.delete(mid);
      } else {
        if (next.size >= maxTargets) {
          setUpgradeLimit("targets");
          setUpgradeOpen(true);
          return prev;
        }
        next.add(mid);
      }
      return next;
    });
  }

  function handlePlanLimit(code: string) {
    if (code === "plan_locked") {
      setUpgradeLimit("plan_locked");
      setUpgradeOpen(true);
      return true;
    }
    if (code === "plan_limit_campaigns") {
      setUpgradeLimit("campaigns");
      setUpgradeOpen(true);
      return true;
    }
    if (code === "plan_limit_targets") {
      setUpgradeLimit("targets");
      setUpgradeOpen(true);
      return true;
    }
    toast.error(resolveActionError(te, code, tt("error")));
    return false;
  }

  const runGate = runProgress
    ? {
        targetCount: runProgress.targetCount,
        dailyLimitReached: runProgress.dailyLimitReached,
        withinWindow: runProgress.withinWindow,
        locked,
      }
    : null;
  const runDisabledKey = runGate
    ? campaignRunDisabledReason(runGate)
    : null;
  const runDisabledLabel = runDisabledKey
    ? t(`progress.${runDisabledKey}`)
    : null;
  const canRun = runGate ? canRunNextCampaign(runGate) : false;

  async function runNextConfirmed() {
    if (!initial) return;
    setRunning(true);
    try {
      const res = await runCampaignNow(initial.id);
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
      setRunning(false);
      setRunConfirmOpen(false);
    }
  }

  async function save() {
    if (!name.trim()) {
      toast.error(tt("error"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        templateId: templateId || null,
        timezone,
        windowStartHour,
        windowEndHour,
        cronExpr: cronFromSchedule({
          preset: schedulePreset,
          hour: scheduleHour,
          minute: scheduleMinute,
        }),
        maxSends,
        delayBetweenTargetsSec: Math.max(
          MIN_ACCOUNT_SEND_DELAY_SEC,
          delayMinutes * 60,
        ),
        perChatCooldownSec: Math.max(
          MIN_PER_CHAT_COOLDOWN_SEC,
          perChatMinutes * 60,
        ),
        randomJitterSec: jitter,
        autoStopOnErrors: autoStop,
        enabled,
      };
      const res = initial
        ? await updateCampaign(initial.id, payload)
        : await createCampaign(payload);
      if (!res.ok || !res.id) throw new Error(res.error);
      const targetRes = await setCampaignTargets(res.id, Array.from(targets));
      if (!targetRes.ok) {
        if (!initial) {
          await deleteCampaign(res.id);
        }
        throw new Error(targetRes.error);
      }
      toast.success(initial ? tt("saved") : tt("created"));
      router.push("/dashboard/campaigns");
      router.refresh();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "plan_limit_campaigns" || code === "plan_limit_targets") {
        handlePlanLimit(code);
      } else {
        toast.error(tt("error"));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">{t("sections.basics")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">{t("fields.name")}</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel
              htmlFor="c-template"
              label={t("fields.template")}
              hint={t("hints.template")}
            />
            <Select
              id="c-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">{tc("none")}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </Select>
          </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-h3">{t("sections.schedule")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel
                htmlFor="c-start"
                label={t("fields.windowStart")}
                hint={t("hints.window")}
              />
              <Select
                id="c-start"
                value={String(windowStartHour)}
                onChange={(e) => setWindowStart(Number(e.target.value))}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-end">{t("fields.windowEnd")}</Label>
              <Select
                id="c-end"
                value={String(windowEndHour)}
                onChange={(e) => setWindowEnd(Number(e.target.value))}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </div>
            </div>
          <p className="text-caption text-muted-foreground">{t("help.window")}</p>

          <div className="space-y-1.5">
            <FieldLabel
              htmlFor="c-schedule"
              label={t("fields.schedule")}
              hint={t("hints.schedule")}
            />
            <Select
              id="c-schedule"
              value={schedulePreset}
              onChange={(e) =>
                setSchedulePreset(e.target.value as SchedulePreset)
              }
            >
              {schedulePresets.map((preset) => (
                <option key={preset} value={preset}>
                  {t(`schedule.${preset}`)}
                </option>
              ))}
            </Select>
            <p className="text-caption text-muted-foreground">
              {t(`help.schedule.${schedulePreset}`)}
            </p>
            {hasCronSchedule ? (
              <p className="text-caption text-muted-foreground">
                {t("help.cronQueueHint")}
              </p>
            ) : (
              <p className="text-caption text-muted-foreground">
                {t("help.autoSpread")}
              </p>
            )}
          </div>

          {schedulePreset !== "window" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-schedule-hour">{t("fields.scheduleHour")}</Label>
                <Select
                  id="c-schedule-hour"
                  value={String(scheduleHour)}
                  onChange={(e) => setScheduleHour(Number(e.target.value))}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-schedule-minute">
                  {t("fields.scheduleMinute")}
                </Label>
                <Select
                  id="c-schedule-minute"
                  value={String(scheduleMinute)}
                  onChange={(e) => setScheduleMinute(Number(e.target.value))}
                >
                  {minuteOptions.map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, "0")}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">{t("sections.pacing")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex min-h-11 items-center justify-between rounded-md border border-primary/20 bg-primary/5 p-3">
              <div className="space-y-0.5 pr-3">
                <FieldLabel
                  htmlFor="c-enabled"
                  label={t("fields.enabled")}
                  hint={t("hints.enabled")}
                />
                <p className="text-caption text-muted-foreground">
                  {t("help.enabledExplain")}
                </p>
              </div>
              <Switch
                id="c-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
            {targetCount > 0 ? (
              <p className="rounded-md border border-border bg-muted/30 p-3 text-small text-muted-foreground">
                {t("help.summaryLine", {
                  maxSends,
                  groups: targetCount,
                  perGroup: sendsPerGroupEstimate,
                })}
              </p>
            ) : null}
            <div className="space-y-1.5">
              <FieldLabel
                htmlFor="c-max"
                label={t("fields.maxSends")}
                hint={t("hints.maxSends")}
              />
              <Input
                id="c-max"
                type="number"
                min={1}
                max={maxSendsCap}
                value={maxSends}
                onChange={(e) => setMaxSends(Number(e.target.value))}
                disabled={locked}
              />
              <p className="text-caption text-muted-foreground">
                {t("help.maxSendsCap", { max: maxSendsCap })}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel
                  htmlFor="c-delay"
                  label={t("fields.delay")}
                  hint={t("hints.delay")}
                />
                <Input
                  id="c-delay"
                  type="number"
                  min={MIN_ACCOUNT_SEND_DELAY_SEC / 60}
                  step={1}
                  value={delayMinutes}
                  onChange={(e) => setDelayMinutes(Number(e.target.value))}
                  disabled={locked}
                />
                <p className="text-caption text-muted-foreground">
                  {t("help.delayMin")}
                </p>
              </div>
              <div className="space-y-1.5">
                <FieldLabel
                  htmlFor="c-perchat"
                  label={t("fields.perChatCooldown")}
                  hint={t("hints.perChatCooldown")}
                />
                <Input
                  id="c-perchat"
                  type="number"
                  min={MIN_PER_CHAT_COOLDOWN_SEC / 60}
                  step={1}
                  value={perChatMinutes}
                  onChange={(e) => setPerChatMinutes(Number(e.target.value))}
                  disabled={locked}
                />
                <p className="text-caption text-muted-foreground">
                  {t("help.perChatMin")}
                </p>
              </div>
            </div>
            {targetCount > 0 ? (
              <p className="text-caption text-muted-foreground">
                {t("help.roundEstimate", { minutes: roundEstimateMinutes })}
              </p>
            ) : null}
            <details className="group rounded-md border border-border">
              <summary className="cursor-pointer list-none px-3 py-3 text-small font-medium marker:content-none [&::-webkit-details-marker]:hidden">
                {t("help.advancedPacing")}
              </summary>
              <div className="grid grid-cols-1 gap-4 border-t border-border px-3 pb-3 pt-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="c-autostop">{t("fields.autoStop")}</Label>
                  <Input
                    id="c-autostop"
                    type="number"
                    min={1}
                    value={autoStop}
                    onChange={(e) => setAutoStop(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-jitter">{t("fields.jitter")}</Label>
                  <Input
                    id="c-jitter"
                    type="number"
                    min={0}
                    value={jitter}
                    onChange={(e) => setJitter(Number(e.target.value))}
                  />
                </div>
              </div>
            </details>
            {targetCount > 0 ? (
              <div className="space-y-2 rounded-md border border-border p-3 text-caption text-muted-foreground">
                <p>{t("help.roundRobin")}</p>
                <p>
                  {t("help.sendsPerGroupEstimate", {
                    count: sendsPerGroupEstimate,
                  })}
                </p>
                {showUnequalWarning ? (
                  <p className="text-amber-600 dark:text-amber-500">
                    {t("help.targetsUnequalWarning")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-h3 flex flex-wrap items-center gap-1.5">
              <span>
                {t("fields.targets")} ·{" "}
                {t("targetsSelected", { count: targets.size })}
              </span>
              <FieldHint content={t("hints.targets")} />
              <span className="text-caption font-normal text-muted-foreground">
                ({t("targetLimit", { max: maxTargets })})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chats.length === 0 ? (
              <p className="text-small text-muted-foreground">
                {t("noTargets")}
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {chats.map((chat) => (
                  <li key={chat.chatMid}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[hsl(var(--primary))]"
                        checked={targets.has(chat.chatMid)}
                        onChange={() => toggleTarget(chat.chatMid)}
                        disabled={
                          !chat.present ||
                          (!targets.has(chat.chatMid) &&
                            targets.size >= maxTargets)
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-small">
                        {chat.name}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
        {initial && runProgress ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-muted-foreground">
            <span>
              {t("card.sentTodayShort", {
                sent: runProgress.sentToday,
                max: runProgress.maxSends,
              })}
            </span>
            {runProgress.nextTargetName ? (
              <span>
                {t("progress.nextGroup", { name: runProgress.nextTargetName })}
              </span>
            ) : null}
            {runDisabledLabel ? (
              <span className="text-amber-700 dark:text-amber-400">
                {runDisabledLabel}
              </span>
            ) : null}
            {runProgress.dailyRunId ? (
              <Link
                href={`/dashboard/runs/${runProgress.dailyRunId}`}
                className="text-primary hover:underline"
              >
                {t("card.viewToday")}
              </Link>
            ) : null}
          </div>
        ) : (
          <div />
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/campaigns")}
          >
            {tc("cancel")}
          </Button>
          {initial ? (
            <Button
              variant="outline"
              onClick={() => setRunConfirmOpen(true)}
              disabled={running || saving || !canRun}
              title={runDisabledLabel ?? t("hints.runNext")}
            >
              {t("runNext")}
            </Button>
          ) : null}
          <Button onClick={save} disabled={saving || locked || running}>
            {saving && <IconLoader className="h-4 w-4 animate-spin" />}
            {tc("save")}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={runConfirmOpen}
        onOpenChange={setRunConfirmOpen}
        title={t("runNextConfirmTitle")}
        description={
          runProgress?.nextTargetName
            ? t("runNextConfirmNamed", { name: runProgress.nextTargetName })
            : t("runNextConfirm")
        }
        confirmLabel={t("runNext")}
        cancelLabel={tc("cancel")}
        loading={running}
        onConfirm={runNextConfirmed}
      />

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        limitType={upgradeLimit}
        trialStarted={planUsage.trialStarted}
      />
    </div>
  );
}
