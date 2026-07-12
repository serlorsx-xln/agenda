import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/brand/logo";
import { SiteHeader } from "@/components/marketing/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { getSiteUrl } from "@/lib/site-url";

const GUIDE_LINKS = [
  { key: "schedule" as const, href: "/guides/schedule-line-openchat" },
  { key: "account" as const, href: "/guides/line-personal-vs-oa" },
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guides.index");
  const tApp = await getTranslations("app");
  const siteUrl = getSiteUrl();
  const title = t("metaTitle");
  const description = t("metaDescription");
  const ogImage = `${siteUrl}/og.png`;
  const url = `${siteUrl}/guides`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: tApp("name"),
      type: "website",
      locale: "th_TH",
      images: [{ url: ogImage, width: 1200, height: 630, alt: tApp("name") }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function GuidesIndexPage() {
  const t = await getTranslations("guides");
  const tApp = await getTranslations("app");
  const siteUrl = getSiteUrl();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("index.title"),
    description: t("index.metaDescription"),
    url: `${siteUrl}/guides`,
    isPartOf: { "@type": "WebSite", name: "Agenda", url: siteUrl },
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />
      <main className="container flex-1 py-12 md:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-display font-bold">{t("index.title")}</h1>
          <p className="mt-3 text-body text-muted-foreground">
            {t("index.subtitle")}
          </p>
        </div>
        <div className="mx-auto mt-10 grid max-w-3xl gap-5 md:grid-cols-2">
          {GUIDE_LINKS.map(({ key, href }) => (
            <Link key={key} href={href} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <CardContent className="p-6">
                  <h2 className="text-h3 font-bold">
                    {t(`cards.${key}.title`)}
                  </h2>
                  <p className="mt-2 text-small text-muted-foreground">
                    {t(`cards.${key}.desc`)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
      <footer className="border-t border-border py-8">
        <div className="container flex items-center justify-between text-small text-muted-foreground">
          <Logo />
          <Link href="/" className="hover:text-foreground">
            {tApp("name")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
