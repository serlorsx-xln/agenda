"use client";

import { IconLoader } from "@/lib/icons";

import * as React from "react";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  banUser,
  confirmPaymentAdmin,
  setUserPlan,
  unbanUser,
} from "@/app/(dashboard)/dashboard/admin/actions";
import {
  ConnectionBadge,
  PaymentStatusBadge,
  RunStatusBadge,
} from "@/components/dashboard/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PLANS, type PlanId } from "@/lib/plans";
import { formatDate, formatTHB } from "@/lib/utils";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean | null;
  createdAt: Date;
  connectionStatus: string | null;
  plan: string | null;
};

type AdminPayment = {
  id: string;
  userId: string;
  userEmail: string;
  plan: string;
  amount: number;
  status: string;
  promptpayRef: string | null;
  createdAt: Date;
};

type AdminRun = {
  id: string;
  status: string;
  sentCount: number;
  failedCount: number;
  createdAt: Date;
  campaignName: string;
  userEmail: string;
};

type AuditEntry = {
  id: string;
  action: string;
  targetType: string | null;
  createdAt: Date;
  userEmail: string | null;
};

export function AdminClient({
  users,
  payments,
  runs,
  audit,
  locale,
}: {
  users: AdminUser[];
  payments: AdminPayment[];
  runs: AdminRun[];
  audit: AuditEntry[];
  locale: string;
}) {
  const t = useTranslations("admin");
  const tcs = useTranslations("connect.status");
  const trs = useTranslations("runs.status");
  const tp = useTranslations("billing.paymentStatus");

  return (
    <Tabs defaultValue="users">
      <TabsList>
        <TabsTrigger value="users">{t("tabs.users")}</TabsTrigger>
        <TabsTrigger value="payments">{t("tabs.payments")}</TabsTrigger>
        <TabsTrigger value="runs">{t("tabs.runs")}</TabsTrigger>
        <TabsTrigger value="audit">{t("tabs.audit")}</TabsTrigger>
      </TabsList>

      <TabsContent value="users">
        <div className="grid gap-3 md:hidden">
          {users.map((u) => (
            <AdminUserCard
              key={u.id}
              user={u}
              locale={locale}
              connectionLabel={tcs(u.connectionStatus ?? "disconnected")}
            />
          ))}
        </div>
        <Card className="hidden md:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("users.columns.name")}</TableHead>
                  <TableHead>{t("users.columns.email")}</TableHead>
                  <TableHead>{t("users.columns.role")}</TableHead>
                  <TableHead>{t("users.columns.plan")}</TableHead>
                  <TableHead>{t("users.columns.connection")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("users.columns.joined")}
                  </TableHead>
                  <TableHead>{t("users.columns.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <AdminUserRow
                    key={u.id}
                    user={u}
                    locale={locale}
                    connectionLabel={tcs(
                      u.connectionStatus ?? "disconnected",
                    )}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="payments">
        <Card>
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <p className="py-10 text-center text-small text-muted-foreground">
                {t("payments.empty")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("payments.columns.user")}</TableHead>
                    <TableHead>{t("payments.columns.plan")}</TableHead>
                    <TableHead>{t("payments.columns.amount")}</TableHead>
                    <TableHead>{t("payments.columns.status")}</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      {t("payments.columns.date")}
                    </TableHead>
                    <TableHead>{t("payments.columns.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <AdminPaymentRow
                      key={p.id}
                      payment={p}
                      locale={locale}
                      statusLabel={tp(p.status)}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="runs">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("users.columns.email")}</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Sent</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Failed
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">
                      {r.userEmail}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.campaignName}
                    </TableCell>
                    <TableCell>
                      <RunStatusBadge
                        status={r.status}
                        label={trs(r.status)}
                      />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {r.sentCount}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {r.failedCount}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {formatDate(r.createdAt, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="audit">
        <div className="grid gap-3 md:hidden">
          {audit.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-small text-muted-foreground">
                {t("audit.empty")}
              </CardContent>
            </Card>
          ) : (
            audit.map((a) => (
              <Card key={a.id}>
                <CardContent className="space-y-1 p-4">
                  <p className="font-mono text-caption">{a.action}</p>
                  <p className="text-small text-muted-foreground">
                    {a.userEmail ?? "-"}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {formatDate(a.createdAt, locale)}
                    {a.targetType ? ` · ${a.targetType}` : ""}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
        <Card className="hidden md:block">
          <CardContent className="p-0">
            {audit.length === 0 ? (
              <p className="py-10 text-center text-small text-muted-foreground">
                {t("audit.empty")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("audit.columns.time")}</TableHead>
                    <TableHead>{t("audit.columns.user")}</TableHead>
                    <TableHead>{t("audit.columns.action")}</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      {t("audit.columns.target")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDate(a.createdAt, locale)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.userEmail ?? "-"}
                      </TableCell>
                      <TableCell className="font-mono text-caption">
                        {a.action}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {a.targetType ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function AdminUserCard({
  user,
  locale,
  connectionLabel,
}: {
  user: AdminUser;
  locale: string;
  connectionLabel: string;
}) {
  const t = useTranslations("admin.users");
  const tt = useTranslations("toast");
  const router = useRouter();
  const [loading, setLoading] = React.useState<string | null>(null);
  const [plan, setPlan] = React.useState<PlanId>(
    (user.plan ?? "free") as PlanId,
  );

  async function runAction(
    key: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setLoading(key);
    try {
      const res = await action();
      if (!res.ok) throw new Error(res.error);
      toast.success(t("actionSuccess"));
      router.refresh();
    } catch {
      toast.error(tt("error"));
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-caption text-muted-foreground">{user.email}</p>
          </div>
          {user.banned && (
            <Badge variant="destructive">{t("bannedBadge")}</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={user.role === "admin" ? "default" : "muted"}>
            {user.role}
          </Badge>
          <ConnectionBadge
            status={user.connectionStatus ?? "disconnected"}
            label={connectionLabel}
          />
        </div>
        <Select
          value={plan}
          disabled={loading === "plan"}
          onChange={(e) => {
            const next = e.target.value as PlanId;
            setPlan(next);
            void runAction("plan", () => setUserPlan(user.id, next));
          }}
          className="h-11 w-full capitalize"
        >
          {PLANS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption text-muted-foreground">
            {formatDate(user.createdAt, locale)}
          </span>
          {user.banned ? (
            <Button
              size="touch"
              variant="outline"
              disabled={!!loading}
              onClick={() => void runAction("unban", () => unbanUser(user.id))}
            >
              {loading === "unban" && (
                <IconLoader className="h-4 w-4 animate-spin" />
              )}
              {t("unban")}
            </Button>
          ) : (
            <Button
              size="touch"
              variant="destructive"
              disabled={!!loading || user.role === "admin"}
              onClick={() => void runAction("ban", () => banUser(user.id))}
            >
              {loading === "ban" && (
                <IconLoader className="h-4 w-4 animate-spin" />
              )}
              {t("ban")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminUserRow({
  user,
  locale,
  connectionLabel,
}: {
  user: AdminUser;
  locale: string;
  connectionLabel: string;
}) {
  const t = useTranslations("admin.users");
  const tt = useTranslations("toast");
  const router = useRouter();
  const [loading, setLoading] = React.useState<string | null>(null);
  const [plan, setPlan] = React.useState<PlanId>(
    (user.plan ?? "free") as PlanId,
  );

  async function runAction(
    key: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setLoading(key);
    try {
      const res = await action();
      if (!res.ok) throw new Error(res.error);
      toast.success(t("actionSuccess"));
      router.refresh();
    } catch {
      toast.error(tt("error"));
    } finally {
      setLoading(null);
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {user.name}
          {user.banned && (
            <Badge variant="destructive">{t("bannedBadge")}</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <Badge variant={user.role === "admin" ? "default" : "muted"}>
          {user.role}
        </Badge>
      </TableCell>
      <TableCell>
        <Select
          value={plan}
          disabled={loading === "plan"}
          onChange={(e) => {
            const next = e.target.value as PlanId;
            setPlan(next);
            void runAction("plan", () => setUserPlan(user.id, next));
          }}
          className="h-8 w-28 capitalize"
        >
          {PLANS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </TableCell>
      <TableCell>
        <ConnectionBadge
          status={user.connectionStatus ?? "disconnected"}
          label={connectionLabel}
        />
      </TableCell>
      <TableCell className="hidden sm:table-cell text-muted-foreground">
        {formatDate(user.createdAt, locale)}
      </TableCell>
      <TableCell>
        {user.banned ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!!loading}
            onClick={() => void runAction("unban", () => unbanUser(user.id))}
          >
            {loading === "unban" && (
              <IconLoader className="h-4 w-4 animate-spin" />
            )}
            {t("unban")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            disabled={!!loading || user.role === "admin"}
            onClick={() => void runAction("ban", () => banUser(user.id))}
          >
            {loading === "ban" && <IconLoader className="h-4 w-4 animate-spin" />}
            {t("ban")}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function AdminPaymentRow({
  payment,
  locale,
  statusLabel,
}: {
  payment: AdminPayment;
  locale: string;
  statusLabel: string;
}) {
  const t = useTranslations("admin.payments");
  const tt = useTranslations("toast");
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function confirm() {
    setLoading(true);
    try {
      const res = await confirmPaymentAdmin(payment.id);
      if (!res.ok) throw new Error(res.error);
      toast.success(t("confirmSuccess"));
      router.refresh();
    } catch {
      toast.error(tt("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="text-muted-foreground">{payment.userEmail}</TableCell>
      <TableCell className="capitalize">{payment.plan}</TableCell>
      <TableCell>{formatTHB(payment.amount, false)}</TableCell>
      <TableCell>
        <PaymentStatusBadge status={payment.status} label={statusLabel} />
      </TableCell>
      <TableCell className="hidden sm:table-cell text-muted-foreground">
        {formatDate(payment.createdAt, locale)}
      </TableCell>
      <TableCell>
        {payment.status === "pending" ? (
          <Button size="sm" disabled={loading} onClick={() => void confirm()}>
            {loading && <IconLoader className="h-4 w-4 animate-spin" />}
            {t("confirm")}
          </Button>
        ) : (
          <span className="text-caption text-muted-foreground">-</span>
        )}
      </TableCell>
    </TableRow>
  );
}
