"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { QrImage } from "@/components/line/qr-image";
import { ConnectionBadge } from "@/components/dashboard/status-badge";
import { FieldHint } from "@/components/ui/field-hint";
import { Button } from "@/components/ui/button";
import { connectErrorMessageKey } from "@/lib/connect-errors";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
type LineStatus = {
  status: "disconnected" | "connecting" | "connected" | "error";
  qrUrl: string | null;
  pin: string | null;
  mid: string | null;
  displayName: string | null;
  lastError: string | null;
  e2eeStatus?: "ok" | "degraded" | "invalid";
};

type WizardStep = "start" | "qr" | "pin" | "done";

function wizardStep(status: LineStatus["status"], data?: LineStatus): WizardStep {
  if (status === "connected") return "done";
  if (status === "connecting") {
    if (data?.pin) return "pin";
    if (data?.qrUrl) return "qr";
    return "qr";
  }
  return "start";
}

const WIZARD_STEPS: WizardStep[] = ["start", "qr", "pin", "done"];

async function fetchStatus(): Promise<LineStatus> {
  const res = await fetch("/api/line/status", { cache: "no-store" });
  if (!res.ok) throw new Error("status_failed");
  return res.json();
}

export function ConnectPanel({
  initialMid,
  initialDisplayName,
}: {
  initialMid: string | null;
  initialDisplayName: string | null;
}) {
  const t = useTranslations("connect");
  const ts = useTranslations("connect.status");
  const tt = useTranslations("toast");
  const qc = useQueryClient();
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ["line-status"],
    queryFn: fetchStatus,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "connecting" ? 2500 : s === "connected" ? 15000 : false;
    },
  });

  const status = data?.status ?? "disconnected";
  const prevStatus = React.useRef(status);

  React.useEffect(() => {
    if (prevStatus.current !== "connected" && status === "connected") {
      router.refresh();
    }
    prevStatus.current = status;
  }, [status, router]);

  const connect = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/line/connect", { method: "POST" });
      if (!res.ok) throw new Error("connect_failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success(tt("connectionStarted"));
      qc.invalidateQueries({ queryKey: ["line-status"] });
    },
    onError: () => toast.error(tt("error")),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/line/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("disconnect_failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success(tt("disconnected"));
      qc.invalidateQueries({ queryKey: ["line-status"] });
      router.refresh();
    },
    onError: () => toast.error(tt("error")),
  });

  const resetE2ee = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/line/reset-e2ee", { method: "POST" });
      if (!res.ok) throw new Error("reset_e2ee_failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success(tt("e2eeResetStarted"));
      qc.invalidateQueries({ queryKey: ["line-status"] });
      router.refresh();
    },
    onError: () => toast.error(tt("error")),
  });

  const showResetE2ee =
    data?.e2eeStatus === "degraded" ||
    data?.e2eeStatus === "invalid" ||
    status === "connected" ||
    (status === "error" &&
      !!data?.lastError &&
      data.lastError.includes("e2ee_keys_invalid"));

  const currentStep = wizardStep(status, data);
  const currentStepIndex = WIZARD_STEPS.indexOf(currentStep);

  return (
    <div className="max-w-xl space-y-4">
      {status !== "connected" && (
        <ol className="grid grid-cols-4 gap-2">
          {WIZARD_STEPS.map((step, index) => {
            const active = index === currentStepIndex;
            const done = index < currentStepIndex;
            return (
              <li
                key={step}
                className={`rounded-md border px-2 py-2 text-center text-caption ${
                  active
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : done
                      ? "border-border bg-muted/40 text-muted-foreground"
                      : "border-border text-muted-foreground"
                }`}
              >
                <span className="block text-caption opacity-70">
                  {index + 1}
                </span>
                {t(`wizard.${step}`)}
              </li>
            );
          })}
        </ol>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-h3">{t("title")}</CardTitle>
            <ConnectionBadge status={status} label={ts(status)} />
          </div>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {status === "connected" ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border p-4">
                <p className="text-small font-medium">
                  {t("connected.title")}
                </p>
                {data?.lastError && (
                  <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-small text-destructive">
                    {(() => {
                      const key = connectErrorMessageKey(data.lastError);
                      return key ? t(key) : data.lastError;
                    })()}
                  </p>
                )}
                {data?.e2eeStatus === "degraded" && !data?.lastError && (
                  <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-small text-amber-800 dark:text-amber-200">
                    {t("e2eeDegraded")}
                  </p>
                )}
                <dl className="mt-3 space-y-2 text-small">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">
                      {t("connected.displayName")}
                    </dt>
                    <dd className="font-medium">
                      {data?.displayName ?? initialDisplayName ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">
                      {t("connected.mid")}
                    </dt>
                    <dd className="truncate font-mono text-caption">
                      {data?.mid ?? initialMid ?? "—"}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="flex flex-wrap gap-2">
                {showResetE2ee && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      onClick={() => resetE2ee.mutate()}
                      disabled={resetE2ee.isPending || disconnect.isPending}
                    >
                      {resetE2ee.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {t("actions.resetE2ee")}
                    </Button>
                    <FieldHint content={t("hints.resetE2ee")} />
                  </div>
                )}
                <Button
                  variant="destructive"
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending || resetE2ee.isPending}
                >
                  {disconnect.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Unplug className="h-4 w-4" />
                  )}
                  {t("actions.disconnect")}
                </Button>
              </div>
            </div>
          ) : status === "connecting" ? (
            <div className="flex flex-col items-center gap-5 py-4 text-center">
              {data?.qrUrl ? (
                <>
                  <div>
                    <p className="text-body font-medium">{t("qr.title")}</p>
                    <p className="mt-1 text-small text-muted-foreground">
                      {t("qr.instruction")}
                    </p>
                  </div>
                  <QrImage value={data.qrUrl} />
                </>
              ) : data?.pin ? null : (
                <div className="flex items-center gap-2 text-small text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("qr.generating")}
                </div>
              )}

              {data?.pin && (
                <div className="w-full rounded-md border border-border p-4">
                  <div className="flex items-center gap-1.5">
                    <p className="text-small font-medium">{t("pin.title")}</p>
                    <FieldHint content={t("hints.pin")} />
                  </div>
                  <p className="mt-1 text-small text-muted-foreground">
                    {t("pin.instruction")}
                  </p>
                  <p className="mt-3 text-center font-mono text-display font-bold tracking-widest">
                    {data.pin}
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {t("actions.cancel")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-small text-muted-foreground">
                {t("wizard.intro")}
              </p>
              {status === "error" && data?.lastError && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-small text-destructive">
                  {(() => {
                    const key = connectErrorMessageKey(data.lastError);
                    return key ? t(key) : t("errors.loginFailed");
                  })()}
                </p>
              )}
              {showResetE2ee && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    onClick={() => resetE2ee.mutate()}
                    disabled={resetE2ee.isPending || connect.isPending}
                  >
                    {resetE2ee.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {t("actions.resetE2ee")}
                  </Button>
                  <FieldHint content={t("hints.resetE2ee")} />
                </div>
              )}
              <Button
                onClick={() => connect.mutate()}
                disabled={connect.isPending}
              >
                {connect.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {status === "error"
                  ? t("actions.reconnect")
                  : t("actions.start")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
