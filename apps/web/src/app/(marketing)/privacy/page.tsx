import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SiteHeader } from "@/components/marketing/site-header";
import { Logo } from "@/components/brand/logo";

export default async function PrivacyPage() {
  const t = await getTranslations("legal.privacy");

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container flex-1 py-16">
        <article className="mx-auto max-w-3xl">
          <h1 className="text-h1 font-bold">{t("title")}</h1>
          <p className="mt-2 text-small text-muted-foreground">{t("updated")}</p>
          <div className="mt-8 space-y-8 text-body">
            {(["collect", "use", "storage", "sharing", "rights"] as const).map(
              (section) => (
                <section key={section}>
                  <h2 className="text-h2 font-bold">{t(`sections.${section}.title`)}</h2>
                  <p className="mt-2 text-muted-foreground">
                    {t(`sections.${section}.body`)}
                  </p>
                </section>
              ),
            )}
          </div>
        </article>
      </main>
      <footer className="border-t border-border py-8">
        <div className="container flex items-center justify-between text-small text-muted-foreground">
          <Logo />
          <Link href="/" className="hover:text-foreground">
            {t("backHome")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
