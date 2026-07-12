import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsClient } from "@/components/settings/settings-client";
import { requireUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("settings");

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <SettingsClient initialName={user.name} email={user.email} />
    </div>
  );
}
