import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/brand/logo";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";
import { getSiteUrl } from "@/lib/site-url";

export type GuideSlug = "schedule" | "account" | "payment";

const GUIDE_PATHS: Record<GuideSlug, string> = {
  schedule: "/guides/schedule-line-openchat",
  account: "/guides/line-personal-vs-oa",
  payment: "/guides/promptpay-slip",
};

export async function guideMetadata(slug: GuideSlug): Promise<Metadata> {
  const t = await getTranslations(`guides.${slug}`);
  const tApp = await getTranslations("app");
  const siteUrl = getSiteUrl();
  const url = `${siteUrl}${GUIDE_PATHS[slug]}`;
  const title = t("metaTitle");
  const description = t("metaDescription");
  const ogImage = `${siteUrl}/og.png`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: tApp("name"),
      type: "article",
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

export async function GuideArticle({ slug }: { slug: GuideSlug }) {
  const t = await getTranslations(`guides.${slug}`);
  const tIndex = await getTranslations("guides.index");
  const tApp = await getTranslations("app");
  const tLanding = await getTranslations("landing");
  const siteUrl = getSiteUrl();
  const path = GUIDE_PATHS[slug];
  const body = t.raw("body") as string[];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: t("title"),
      description: t("metaDescription"),
      author: { "@type": "Organization", name: "Agenda" },
      publisher: { "@type": "Organization", name: "Agenda", url: siteUrl },
      mainEntityOfPage: `${siteUrl}${path}`,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: tApp("name"),
          item: siteUrl,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: tIndex("title"),
          item: `${siteUrl}/guides`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: t("title"),
          item: `${siteUrl}${path}`,
        },
      ],
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />
      <main className="container flex-1 py-12 md:py-16">
        <article className="mx-auto max-w-2xl">
          <nav className="text-small text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              {tApp("name")}
            </Link>
            <span className="mx-2">/</span>
            <Link href="/guides" className="hover:text-foreground">
              {tIndex("title")}
            </Link>
          </nav>
          <h1 className="mt-4 text-display font-bold">{t("title")}</h1>
          <div className="mt-8 space-y-4 text-body text-muted-foreground">
            {body.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/signup">{tLanding("hero.ctaPrimary")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/#pricing">{tLanding("pricing.title")}</Link>
            </Button>
          </div>
        </article>
      </main>
      <footer className="border-t border-border py-8">
        <div className="container flex items-center justify-between text-small text-muted-foreground">
          <Logo />
          <Link href="/guides" className="hover:text-foreground">
            {tIndex("title")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
