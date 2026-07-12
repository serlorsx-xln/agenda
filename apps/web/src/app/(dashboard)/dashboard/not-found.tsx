import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

export default async function DashboardNotFound() {
  const t = await getTranslations("errors.notFound");

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-h1 font-bold">{t("title")}</h1>
      <p className="max-w-md text-body text-muted-foreground">{t("description")}</p>
      <Button asChild>
        <Link href="/dashboard">{t("back")}</Link>
      </Button>
    </div>
  );
}
