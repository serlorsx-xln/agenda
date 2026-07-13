import { AlertTriangle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import {
  BillingPlans,
  PendingPaymentActions,
} from "@/components/billing/billing-client";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaymentStatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSubscription } from "@/lib/db-helpers";
import { getPlanUsage } from "@/lib/plan-limits";
import { getPayments } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { formatDate, formatTHB } from "@/lib/utils";

export default async function BillingPage() {
  const user = await requireUser();
  const t = await getTranslations("billing");
  const tp = await getTranslations("billing.paymentStatus");
  const locale = await getLocale();

  const [subscription, payments, planUsage] = await Promise.all([
    getSubscription(user.id),
    getPayments(user.id),
    getPlanUsage(user.id),
  ]);

  const displayPlan = planUsage.isOnTrial
    ? "growth"
    : planUsage.isLocked
      ? "locked"
      : (subscription?.plan ?? "free");

  const promptPayId = process.env.PROMPTPAY_ID ?? "";
  const integrationReady =
    promptPayId.length > 0 && promptPayId !== "0000000000";

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {planUsage.isOnTrial && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-small">
            {t("trialBanner", { days: planUsage.trialDaysLeft ?? 0 })}
          </CardContent>
        </Card>
      )}

      {!integrationReady && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
              strokeWidth={1.75}
            />
            <div>
              <p className="text-small font-semibold">
                {t("integrationPending")}
              </p>
              <p className="mt-1 text-small text-muted-foreground">
                {t("integrationNote")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <BillingPlans
        currentPlan={displayPlan}
        isOnTrial={planUsage.isOnTrial}
        trialDaysLeft={planUsage.trialDaysLeft}
      />

      <div className="space-y-3">
        <h2 className="text-h3 font-bold">{t("history")}</h2>
        {payments.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-small text-muted-foreground">
              {t("historyEmpty")}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {payments.map((p) => (
                <Card key={p.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium capitalize">{p.plan}</p>
                        <p className="text-caption text-muted-foreground">
                          {formatDate(p.createdAt, locale)}
                        </p>
                      </div>
                      <PaymentStatusBadge
                        status={p.status}
                        label={tp(p.status)}
                      />
                    </div>
                    <p className="text-h3 font-bold">{formatTHB(p.amount, false)}</p>
                    {p.promptpayRef && (
                      <p className="font-mono text-caption text-muted-foreground">
                        {p.promptpayRef}
                      </p>
                    )}
                    {p.status === "pending" && (
                      <PendingPaymentActions paymentId={p.id} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="hidden md:block">
              <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.date")}</TableHead>
                    <TableHead>{t("columns.plan")}</TableHead>
                    <TableHead>{t("columns.amount")}</TableHead>
                    <TableHead>{t("columns.status")}</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      {t("columns.reference")}
                    </TableHead>
                    <TableHead>{t("columns.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDate(p.createdAt, locale)}
                      </TableCell>
                      <TableCell className="capitalize">{p.plan}</TableCell>
                      <TableCell>{formatTHB(p.amount, false)}</TableCell>
                      <TableCell>
                        <PaymentStatusBadge
                          status={p.status}
                          label={tp(p.status)}
                        />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell font-mono text-caption text-muted-foreground">
                        {p.promptpayRef ?? "-"}
                      </TableCell>
                      <TableCell>
                        {p.status === "pending" ? (
                          <PendingPaymentActions paymentId={p.id} />
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </>
        )}
      </div>
    </div>
  );
}
