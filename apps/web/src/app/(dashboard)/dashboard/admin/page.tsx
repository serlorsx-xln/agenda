import { getLocale, getTranslations } from "next-intl/server";

import { AdminClient } from "@/components/admin/admin-client";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  getAdminPayments,
  getAdminRuns,
  getAdminUsers,
  getAuditEntries,
} from "@/lib/queries";
import { requireAdmin } from "@/lib/session";

export default async function AdminPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const locale = await getLocale();

  const [users, payments, runs, audit] = await Promise.all([
    getAdminUsers(),
    getAdminPayments(),
    getAdminRuns(),
    getAuditEntries(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <AdminClient
        users={users}
        payments={payments}
        runs={runs}
        audit={audit}
        locale={locale}
      />
    </div>
  );
}
