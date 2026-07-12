"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  cancelPendingPayment,
  createPromptPayIntent,
  type PromptPayIntent,
} from "@/app/(dashboard)/dashboard/billing/actions";
import { QrImage } from "@/components/line/qr-image";
import { FieldHint } from "@/components/ui/field-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveActionError } from "@/lib/action-errors";
import { PAID_PLANS, type PaidPlanId } from "@/lib/plans";
import { formatTHB } from "@/lib/utils";

export function BillingPlans({
  currentPlan,
  isOnTrial,
  trialDaysLeft,
}: {
  currentPlan: string;
  isOnTrial?: boolean;
  trialDaysLeft?: number | null;
}) {
  const t = useTranslations("billing");
  const te = useTranslations("billing.errors");
  const tt = useTranslations("toast");
  const router = useRouter();
  const [intent, setIntent] = React.useState<PromptPayIntent | null>(null);
  const [loadingPlan, setLoadingPlan] = React.useState<string | null>(null);

  async function choose(planId: PaidPlanId) {
    setLoadingPlan(planId);
    try {
      const res = await createPromptPayIntent(planId);
      if (!res.ok) throw new Error(res.error);
      setIntent(res);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(resolveActionError(te, msg, tt("error")));
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {PAID_PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan && !isOnTrial;
          const isTrialPlan = isOnTrial && plan.id === "growth";
          return (
            <Card
              key={plan.id}
              className={plan.highlighted ? "border-primary" : undefined}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-h2">{plan.name}</CardTitle>
                  {isTrialPlan && (
                    <Badge variant="secondary">
                      {t("trialActive", { days: trialDaysLeft ?? 0 })}
                    </Badge>
                  )}
                  {isCurrent && (
                    <Badge variant="secondary">{t("currentPlan")}</Badge>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-h1 font-bold">
                    {formatTHB(plan.monthlyAmount)}
                  </span>
                  <span className="text-small text-muted-foreground">
                    {t("perMonth")}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-small text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    {t("features.campaigns", { count: plan.maxCampaigns })}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    {t("features.targets", {
                      count: plan.maxTargetsPerCampaign,
                    })}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    {t("features.pacing")}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    {t("features.autoReplyRules", {
                      count: plan.maxAutoReplyRules,
                    })}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    {t("features.mediaAssets", {
                      count: plan.maxMediaAssets,
                    })}
                  </li>
                  {plan.features.maxTemplates !== null && (
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      {t("features.templates", {
                        count: plan.features.maxTemplates,
                      })}
                    </li>
                  )}
                  {plan.features.maxTemplates === null && (
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      {t("features.templatesUnlimited")}
                    </li>
                  )}
                  {plan.features.schedulingCron && (
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      {t("features.schedulingCron")}
                    </li>
                  )}
                  {plan.features.autoReplyImages && (
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      {t("features.autoReplyImages")}
                    </li>
                  )}
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0" />
                    <span className="flex-1">
                      {t("features.maxSendsPerDay", {
                        count: plan.features.maxSendsPerDayCap,
                      })}
                    </span>
                    <FieldHint content={t("hints.maxSendsPerDay")} />
                  </li>
                </ul>
                <Button
                  className="w-full"
                  variant={plan.highlighted ? "default" : "outline"}
                  disabled={
                    isCurrent || isTrialPlan || loadingPlan === plan.id
                  }
                  onClick={() => {
                    if (isCurrent || isTrialPlan) return;
                    void choose(plan.id);
                  }}
                >
                  {loadingPlan === plan.id && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {isTrialPlan
                    ? t("trialActive", { days: trialDaysLeft ?? 0 })
                    : isCurrent
                      ? t("currentPlan")
                      : t("payWithPromptPay")}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PromptPayDialog
        intent={intent}
        onClose={() => setIntent(null)}
        onPaid={() => {
          setIntent(null);
          router.refresh();
        }}
      />
    </>
  );
}

function PromptPayDialog({
  intent,
  onClose,
  onPaid,
}: {
  intent: PromptPayIntent | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const t = useTranslations("billing.promptpay");
  const tt = useTranslations("toast");
  const locale = useLocale();
  const open = !!intent?.qrPayload;
  const [uploading, setUploading] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  const expiresMs = intent?.expiresAt
    ? new Date(intent.expiresAt).getTime() - now
    : null;
  const expiresLabel =
    expiresMs != null && expiresMs > 0
      ? `${Math.floor(expiresMs / 60000)}:${String(
          Math.floor((expiresMs % 60000) / 1000),
        ).padStart(2, "0")}`
      : null;

  async function onUpload(file: File) {
    if (!intent?.paymentId) return;
    setUploading(true);
    setErrorKey(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/billing/payments/${intent.paymentId}/slip`, {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setErrorKey(body.error ?? "verify_failed");
        toast.error(t(`errors.${body.error ?? "verify_failed"}` as "errors.not_found"));
        return;
      }
      toast.success(tt("paymentConfirmed"));
      onPaid();
    } catch {
      setErrorKey("upstream_error");
      toast.error(tt("error"));
    } finally {
      setUploading(false);
    }
  }

  async function onCancel() {
    if (!intent?.paymentId) return;
    setCancelling(true);
    try {
      const res = await cancelPendingPayment(intent.paymentId);
      if (!res.ok) throw new Error(res.error);
      toast.success(tt("paymentCancelled"));
      onClose();
    } catch {
      toast.error(tt("error"));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("scan")}</DialogDescription>
        </DialogHeader>
        {intent?.qrPayload && (
          <div className="flex flex-col items-center gap-4">
            <QrImage value={intent.qrPayload} />
            <dl className="w-full space-y-2 text-small">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("amount")}</dt>
                <dd className="font-medium">
                  {new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
                    style: "currency",
                    currency: "THB",
                    minimumFractionDigits: 0,
                  }).format(intent.amount ?? 0)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("reference")}</dt>
                <dd className="font-mono text-caption">{intent.reference}</dd>
              </div>
              {expiresLabel && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("expiresIn")}</dt>
                  <dd className="font-mono text-caption">{expiresLabel}</dd>
                </div>
              )}
            </dl>

            <label className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border p-4 text-center text-small hover:bg-muted/40">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span>{uploading ? t("verifying") : t("uploadSlip")}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUpload(f);
                  e.target.value = "";
                }}
              />
            </label>

            {errorKey && (
              <p className="w-full rounded-md border border-destructive/30 bg-destructive/5 p-2 text-caption text-destructive">
                {t(`errors.${errorKey}` as "errors.not_found")}
              </p>
            )}

            <p className="text-caption text-muted-foreground">{t("uploadHint")}</p>

            <Button
              variant="outline"
              className="w-full"
              disabled={cancelling || uploading}
              onClick={() => void onCancel()}
            >
              {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("cancelPayment")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PendingPaymentActions({ paymentId }: { paymentId: string }) {
  const t = useTranslations("billing.promptpay");
  const tt = useTranslations("toast");
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function cancel() {
    setBusy(true);
    try {
      const res = await cancelPendingPayment(paymentId);
      if (!res.ok) throw new Error(res.error);
      toast.success(tt("paymentCancelled"));
      router.refresh();
    } catch {
      toast.error(tt("error"));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/billing/payments/${paymentId}/slip`, {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        toast.error(t(`errors.${body.error ?? "verify_failed"}` as "errors.not_found"));
        return;
      }
      toast.success(tt("paymentConfirmed"));
      router.refresh();
    } catch {
      toast.error(tt("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-caption hover:bg-muted/40">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {t("uploadSlip")}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.target.value = "";
          }}
        />
      </label>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => void cancel()}
      >
        {t("cancelPayment")}
      </Button>
    </div>
  );
}
