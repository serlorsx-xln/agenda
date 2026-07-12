import { getTranslations } from "next-intl/server";

import { ConnectPanel } from "@/components/line/connect-panel";
import { PageHeader } from "@/components/dashboard/page-header";
import { getConnection } from "@/lib/db-helpers";
import { requireUser } from "@/lib/session";

export default async function ConnectPage() {
  const user = await requireUser();
  const t = await getTranslations("connect");
  const connection = await getConnection(user.id);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ConnectPanel
        initialMid={connection?.mid ?? null}
        initialDisplayName={connection?.displayName ?? null}
      />
    </div>
  );
}
