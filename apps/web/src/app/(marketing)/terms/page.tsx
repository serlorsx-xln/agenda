import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SiteHeader } from "@/components/marketing/site-header";
import { Logo } from "@/components/brand/logo";
import { SUPPORT_LINE_URL } from "@/lib/support";

export default async function TermsPage() {
  const t = await getTranslations("legal.terms");
  const tLanding = await getTranslations("landing");

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container flex-1 py-16">
        <article className="mx-auto max-w-3xl">
          <h1 className="text-h1 font-bold">{t("title")}</h1>
          <p className="mt-2 text-small text-muted-foreground">{t("updated")}</p>
          <div className="mt-8 space-y-8 text-body">
            {(["acceptance", "service", "account", "billing", "liability"] as const).map(
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
        <div className="container flex items-center justify-between gap-4 text-small text-muted-foreground">
          <Logo />
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
            <a
              href={SUPPORT_LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {tLanding("footer.contact")}
            </a>
            <Link href="/" className="hover:text-foreground">
              {t("backHome")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
