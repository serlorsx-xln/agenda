"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createCampaign,
  deleteCampaign,
  setCampaignTargets,
  updateCampaign,
} from "@/app/(dashboard)/dashboard/campaigns/actions";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { ChatCheckboxList } from "@/components/line/chat-checkbox-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type ChatOption = {
  chatMid: string;
  name: string;
  kind?: string;
  present: boolean;
};

export type CampaignFormInitial = {
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
const DEFAULT_WINDOW_START = 9;
const DEFAULT_WINDOW_END = 21;

function allowedSchedulePresets(planUsage: PlanUsageSnapshot): SchedulePreset[] {
  if (planUsage.features.schedulingCron) return SCHEDULE_PRESETS;
  return ["window"];
}

export function isAdvancedCampaign(c: CampaignFormInitial | null): boolean {
  if (!c) return false;
  const allDay = c.windowStartHour === c.windowEndHour;
  const defaultWindow =
    !allDay &&
    c.windowStartHour === DEFAULT_WINDOW_START &&
    c.windowEndHour === DEFAULT_WINDOW_END;
  const schedule = scheduleFromCron(c.cronExpr);
  return (
    schedule.preset !== "window" ||
    (!allDay && !defaultWindow) ||
    c.delayBetweenTargetsSec !== DEFAULT_SEND_DELAY_SEC ||
    c.perChatCooldownSec !== DEFAULT_PER_CHAT_COOLDOWN_SEC ||
    c.randomJitterSec !== DEFAULT_SEND_JITTER_SEC ||
    c.autoStopOnErrors !== 3
  );
}

export function CampaignFormDialog({
  open,
  onOpenChange,
  templates,
  chats,
  planUsage,
  initial,
  initialTargets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: TemplateOption[];
  chats: ChatOption[];
  planUsage: PlanUsageSnapshot;
  initial?: CampaignFormInitial | null;
  initialTargets?: string[];
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

  const [simpleMode, setSimpleMode] = React.useState(true);
  const [name, setName] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [allDay, setAllDay] = React.useState(false);
  const [windowStartHour, setWindowStart] = React.useState(DEFAULT_WINDOW_START);
  const [windowEndHour, setWindowEnd] = React.useState(DEFAULT_WINDOW_END);
  const [schedulePreset, setSchedulePreset] =
    React.useState<SchedulePreset>("window");
  const [scheduleHour, setScheduleHour] = React.useState(9);
  const [scheduleMinute, setScheduleMinute] = React.useState(0);
  const [maxSends, setMaxSends] = React.useState(
    Math.min(100, maxSendsCap || 100),
  );
  const [delayMinutes, setDelayMinutes] = React.useState(
    DEFAULT_SEND_DELAY_SEC / 60,
  );
  const [perChatMinutes, setPerChatMinutes] = React.useState(
    DEFAULT_PER_CHAT_COOLDOWN_SEC / 60,
  );
  const [jitter, setJitter] = React.useState(DEFAULT_SEND_JITTER_SEC);
  const [autoStop, setAutoStop] = React.useState(3);
  const [enabled, setEnabled] = React.useState(false);
  const [targets, setTargets] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [upgradeLimit, setUpgradeLimit] =
    React.useState<UpgradeLimitType>("targets");
  const [pickerKey, setPickerKey] = React.useState(0);

  const timezone = initial?.timezone ?? "Asia/Bangkok";

  const minuteOptions = React.useMemo(() => {
    const opts = new Set(BASE_MINUTES);
    opts.add(scheduleMinute);
    return [...opts].sort((a, b) => a - b);
  }, [scheduleMinute]);

  React.useEffect(() => {
    if (!open) return;
    setPickerKey((k) => k + 1);
    const c = initial ?? null;
    setSimpleMode(c ? !isAdvancedCampaign(c) : true);
    setName(c?.name ?? "");
    const tid = c?.templateId;
    setTemplateId(
      tid && templates.some((tpl) => tpl.id === tid)
        ? tid
        : (templates[0]?.id ?? ""),
    );
    const isAllDay = c != null && c.windowStartHour === c.windowEndHour;
    setAllDay(isAllDay);
    setWindowStart(
      isAllDay ? DEFAULT_WINDOW_START : (c?.windowStartHour ?? DEFAULT_WINDOW_START),
    );
    setWindowEnd(
      isAllDay ? DEFAULT_WINDOW_END : (c?.windowEndHour ?? DEFAULT_WINDOW_END),
    );
    const schedule = scheduleFromCron(c?.cronExpr);
    setSchedulePreset(schedule.preset);
    setScheduleHour(schedule.hour);
    setScheduleMinute(schedule.minute);
    setMaxSends(c?.maxSends ?? Math.min(100, maxSendsCap || 100));
    setDelayMinutes(
      Math.max(
        MIN_ACCOUNT_SEND_DELAY_SEC / 60,
        Math.round((c?.delayBetweenTargetsSec ?? DEFAULT_SEND_DELAY_SEC) / 60),
      ),
    );
    setPerChatMinutes(
      Math.max(
        MIN_PER_CHAT_COOLDOWN_SEC / 60,
        Math.round(
          (c?.perChatCooldownSec ?? DEFAULT_PER_CHAT_COOLDOWN_SEC) / 60,
        ),
      ),
    );
    setJitter(c?.randomJitterSec ?? DEFAULT_SEND_JITTER_SEC);
    setAutoStop(c?.autoStopOnErrors ?? 3);
    setEnabled(c?.enabled ?? false);
    setTargets(new Set(initialTargets ?? []));
  }, [open, initial, initialTargets, templates, maxSendsCap]);

  function toggleTarget(mid: string) {
    setTargets((prev) => {
      const next = new Set(prev);
      if (next.has(mid)) next.delete(mid);
      else next.add(mid);
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

  async function save() {
    if (!name.trim()) {
      toast.error(tt("error"));
      return;
    }
    if (!templateId) {
      toast.error(te("template_required"));
      return;
    }
    const useAllDay = allDay;
    const start = useAllDay
      ? 0
      : simpleMode
        ? DEFAULT_WINDOW_START
        : windowStartHour;
    const end = useAllDay
      ? 0
      : simpleMode
        ? DEFAULT_WINDOW_END
        : windowEndHour;
    if (!useAllDay && start === end) {
      toast.error(te("window_equal_hours"));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        templateId,
        timezone,
        windowStartHour: start,
        windowEndHour: end,
        cronExpr: simpleMode
          ? null
          : cronFromSchedule({
              preset: schedulePreset,
              hour: scheduleHour,
              minute: scheduleMinute,
            }),
        maxSends,
        delayBetweenTargetsSec: simpleMode
          ? DEFAULT_SEND_DELAY_SEC
          : Math.max(MIN_ACCOUNT_SEND_DELAY_SEC, delayMinutes * 60),
        perChatCooldownSec: simpleMode
          ? DEFAULT_PER_CHAT_COOLDOWN_SEC
          : Math.max(MIN_PER_CHAT_COOLDOWN_SEC, perChatMinutes * 60),
        randomJitterSec: simpleMode ? DEFAULT_SEND_JITTER_SEC : jitter,
        autoStopOnErrors: simpleMode ? 3 : autoStop,
        enabled,
      };
      const res = initial
        ? await updateCampaign(initial.id, payload)
        : await createCampaign(payload);
      if (!res.ok || !res.id) throw new Error(res.error);
      const targetRes = await setCampaignTargets(res.id, Array.from(targets));
      if (!targetRes.ok) {
        if (!initial) await deleteCampaign(res.id);
        throw new Error(targetRes.error);
      }
      toast.success(initial ? tt("saved") : tt("created"));
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (
        code === "plan_limit_campaigns" ||
        code === "plan_limit_targets" ||
        code === "plan_locked"
      ) {
        handlePlanLimit(code);
      } else {
        toast.error(resolveActionError(te, code, tt("error")));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{initial ? t("edit") : t("new")}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 rounded-md border border-border p-1">
            <Button
              type="button"
              variant={simpleMode ? "default" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setSimpleMode(true)}
            >
              {t("mode.simple")}
            </Button>
            <Button
              type="button"
              variant={!simpleMode ? "default" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setSimpleMode(false)}
            >
              {t("mode.advanced")}
            </Button>
            <FieldHint
              content={t("hints.mode")}
              className="shrink-0 self-center pr-1"
            />
          </div>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cf-name">{t("fields.name")}</Label>
              <Input
                id="cf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel
                htmlFor="cf-template"
                label={t("fields.template")}
                hint={t("hints.template")}
              />
              {templates.length === 0 ? (
                <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-small text-muted-foreground">
                    {t("templateRequired")}
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/templates?need=campaign">
                      {t("createTemplateFirst")}
                    </Link>
                  </Button>
                </div>
              ) : (
                <Select
                  id="cf-template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <FieldLabel
                label={`${t("fields.targets")} · ${t("targetsSelected", { count: targets.size })}`}
                hint={t("hints.targets")}
              />
              <p className="text-caption text-muted-foreground">
                {t("targetLimit", { max: maxTargets })}
              </p>
              {chats.length === 0 ? (
                <p className="rounded-md border border-border p-3 text-small text-muted-foreground">
                  {t("noTargets")}
                </p>
              ) : (
                <ChatCheckboxList
                  key={pickerKey}
                  chats={chats}
                  selected={targets}
                  onToggle={toggleTarget}
                  maxSelected={maxTargets}
                  onMaxReached={() => {
                    setUpgradeLimit("targets");
                    setUpgradeOpen(true);
                  }}
                  listClassName="max-h-40"
                  groupLabel={t("chatKinds.group")}
                  openChatLabel={t("chatKinds.openchat")}
                />
              )}
            </div>

            <div className="flex min-h-11 items-center justify-between rounded-md border border-border p-3">
              <div className="space-y-0.5 pr-3">
                <FieldLabel
                  htmlFor="cf-allday"
                  label={t("fields.allDay")}
                  hint={t("hints.allDay")}
                />
                <p className="text-caption text-muted-foreground">
                  {t("help.allDay")}
                </p>
              </div>
              <Switch
                id="cf-allday"
                checked={allDay}
                onCheckedChange={setAllDay}
              />
            </div>

            {!simpleMode && !allDay ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel
                    htmlFor="cf-start"
                    label={t("fields.windowStart")}
                    hint={t("hints.window")}
                  />
                  <Select
                    id="cf-start"
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
                  <Label htmlFor="cf-end">{t("fields.windowEnd")}</Label>
                  <Select
                    id="cf-end"
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
            ) : null}

            <div className="space-y-1.5">
              <FieldLabel
                htmlFor="cf-max"
                label={t("fields.maxSends")}
                hint={t("hints.maxSends")}
              />
              <Input
                id="cf-max"
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

            {!simpleMode ? (
              <>
                <div className="space-y-1.5">
                  <FieldLabel
                    htmlFor="cf-schedule"
                    label={t("fields.schedule")}
                    hint={t("hints.schedule")}
                  />
                  <Select
                    id="cf-schedule"
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
                </div>

                {schedulePreset !== "window" ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="cf-sh">{t("fields.scheduleHour")}</Label>
                      <Select
                        id="cf-sh"
                        value={String(scheduleHour)}
                        onChange={(e) =>
                          setScheduleHour(Number(e.target.value))
                        }
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, "0")}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cf-sm">
                        {t("fields.scheduleMinute")}
                      </Label>
                      <Select
                        id="cf-sm"
                        value={String(scheduleMinute)}
                        onChange={(e) =>
                          setScheduleMinute(Number(e.target.value))
                        }
                      >
                        {minuteOptions.map((m) => (
                          <option key={m} value={m}>
                            {String(m).padStart(2, "0")}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel
                      htmlFor="cf-delay"
                      label={t("fields.delay")}
                      hint={t("hints.delay")}
                    />
                    <Input
                      id="cf-delay"
                      type="number"
                      min={MIN_ACCOUNT_SEND_DELAY_SEC / 60}
                      step={1}
                      value={delayMinutes}
                      onChange={(e) =>
                        setDelayMinutes(Number(e.target.value))
                      }
                      disabled={locked}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      htmlFor="cf-perchat"
                      label={t("fields.perChatCooldown")}
                      hint={t("hints.perChatCooldown")}
                    />
                    <Input
                      id="cf-perchat"
                      type="number"
                      min={MIN_PER_CHAT_COOLDOWN_SEC / 60}
                      step={1}
                      value={perChatMinutes}
                      onChange={(e) =>
                        setPerChatMinutes(Number(e.target.value))
                      }
                      disabled={locked}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-autostop">{t("fields.autoStop")}</Label>
                    <Input
                      id="cf-autostop"
                      type="number"
                      min={1}
                      value={autoStop}
                      onChange={(e) => setAutoStop(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-jitter">{t("fields.jitter")}</Label>
                    <Input
                      id="cf-jitter"
                      type="number"
                      min={0}
                      value={jitter}
                      onChange={(e) => setJitter(Number(e.target.value))}
                    />
                  </div>
                </div>
              </>
            ) : null}

            <div className="flex min-h-11 items-center justify-between rounded-md border border-primary/20 bg-primary/5 p-3">
              <div className="space-y-0.5 pr-3">
                <FieldLabel
                  htmlFor="cf-enabled"
                  label={t("fields.enabled")}
                  hint={t("hints.enabled")}
                />
                <p className="text-caption text-muted-foreground">
                  {t("help.enabledExplain")}
                </p>
              </div>
              <Switch
                id="cf-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={locked}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={saving || locked || !templateId}
            >
              {saving && <IconLoader className="h-4 w-4 animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        limitType={upgradeLimit}
        trialStarted={planUsage.trialStarted}
      />
    </>
  );
}
