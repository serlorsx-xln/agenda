"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  EventStatusBadge,
  RunStatusBadge,
} from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldHint } from "@/components/ui/field-hint";
import { formatDate } from "@/lib/utils";

type RunEvent = {
  id: string;
  chatName: string | null;
  status: string;
  message: string | null;
  createdAt: string;
};

type Run = {
  id: string;
  status: string;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  totalTargets: number;
  startedAt: string | null;
  finishedAt: string | null;
};

const ACTIVE = new Set(["queued", "running"]);

export function RunLive({ runId }: { runId: string }) {
  const t = useTranslations("runs");
  const ts = useTranslations("runs.status");
  const te = useTranslations("runs.eventStatus");
  const tc = useTranslations("common");
  const tt = useTranslations("toast");
  const locale = useLocale();
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);

  const { data } = useQuery({
    queryKey: ["run", runId],
    queryFn: async (): Promise<{ run: Run; events: RunEvent[] }> => {
      const res = await fetch(`/api/runs/${runId}/events`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    refetchInterval: (query) =>
      ACTIVE.has(query.state.data?.run.status ?? "") ? 2000 : false,
  });

  const run = data?.run;
  const events = data?.events ?? [];
  const isActive = run ? ACTIVE.has(run.status) : false;

  async function cancelConfirmed() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error("failed");
      toast.success(tt("runCancelled"));
    } catch {
      toast.error(tt("error"));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-h3">{t("liveTitle")}</CardTitle>
            {run && (
              <div className="flex flex-wrap items-center gap-3">
                {isActive && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <RunStatusBadge status={run.status} label={ts(run.status)} />
                {isActive && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="destructive"
                      size="touch"
                      onClick={() => setCancelOpen(true)}
                      disabled={cancelling}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {t("cancel")}
                    </Button>
                    <FieldHint content={t("hints.cancel")} />
                  </div>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {run && (
            <div className="space-y-4">
              <p className="text-small text-muted-foreground">
                {t("sentToday", { count: run.sentCount })}
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label={t("columns.sent")} value={run.sentCount} />
                <Stat label={t("columns.failed")} value={run.failedCount} />
                <Stat label={t("columns.skipped")} value={run.skippedCount} />
                <Stat
                  label={t("columns.campaign")}
                  value={`${run.sentCount + run.failedCount}/${run.totalTargets}`}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <p className="py-10 text-center text-small text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-small font-medium">
                      {ev.chatName ?? "—"}
                    </p>
                    {ev.message && (
                      <p className="truncate text-caption text-muted-foreground">
                        {ev.message}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-caption text-muted-foreground">
                      {formatDate(ev.createdAt, locale)}
                    </span>
                    <EventStatusBadge status={ev.status} label={te(ev.status)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t("cancelConfirmTitle")}
        description={t("cancelConfirmDescription")}
        confirmLabel={t("cancelConfirmAction")}
        cancelLabel={tc("cancel")}
        variant="destructive"
        loading={cancelling}
        onConfirm={cancelConfirmed}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="mt-1 text-h2 font-bold">{value}</p>
    </div>
  );
}
