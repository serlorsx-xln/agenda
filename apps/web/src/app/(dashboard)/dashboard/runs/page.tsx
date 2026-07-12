import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/dashboard/page-header";
import { RunStatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRuns } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export default async function RunsPage() {
  const user = await requireUser();
  const t = await getTranslations("runs");
  const ts = await getTranslations("runs.status");
  const ttr = await getTranslations("runs.trigger");
  const locale = await getLocale();
  const runs = await getRuns(user.id);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-small text-muted-foreground">{t("empty")}</p>
            <Button asChild size="touch">
              <Link href="/dashboard/campaigns">{t("emptyCta")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-caption text-muted-foreground">
            {t("dailyAggregateHint")}
          </p>
          <div className="grid gap-3 md:hidden">
            {runs.map((run) => (
              <Card key={run.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/dashboard/runs/${run.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {run.campaignName}
                    </Link>
                    <RunStatusBadge
                      status={run.status}
                      label={ts(run.status)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
                    <span>
                      {t("columns.sent")}: {run.sentCount}
                    </span>
                    <span>
                      {t("columns.failed")}: {run.failedCount}
                    </span>
                    <span>{formatDate(run.startedAt ?? run.createdAt, locale)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="hidden md:block">
            <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.campaign")}</TableHead>
                  <TableHead>{t("columns.status")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("columns.trigger")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("columns.sent")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("columns.failed")}
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("columns.started")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/runs/${run.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {run.campaignName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <RunStatusBadge
                        status={run.status}
                        label={ts(run.status)}
                      />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {ttr(run.trigger)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {run.sentCount}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {run.failedCount}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {formatDate(run.startedAt ?? run.createdAt, locale)}
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
  );
}
