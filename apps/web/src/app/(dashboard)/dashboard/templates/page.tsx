import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/dashboard/page-header";
import { TemplatesClient } from "@/components/templates/templates-client";
import { getTemplates } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function TemplatesPage() {
  const user = await requireUser();
  const t = await getTranslations("templates");
  const templates = await getTemplates(user.id);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <TemplatesClient
        templates={templates.map((tpl) => ({
          id: tpl.id,
          name: tpl.name,
          body: tpl.body,
          imageAssetIds: tpl.imageAssetIds,
        }))}
      />
    </div>
  );
}
