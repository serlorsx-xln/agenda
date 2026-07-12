import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  CalendarClock,
  FileText,
  Gauge,
  MessageSquareReply,
  Timer,
  SlidersHorizontal,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SiteHeader } from "@/components/marketing/site-header";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { PricingPlanCard } from "@/components/marketing/pricing-plan-card";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PAID_PLANS } from "@/lib/plans";
import { getSiteUrl } from "@/lib/site-url";

const FEATURE_ICONS = {
  schedule: CalendarClock,
  autoReply: MessageSquareReply,
  templates: FileText,
  humanPace: Gauge,
  monitoring: Bell,
  pacing: Timer,
  control: SlidersHorizontal,
} as const;

const FAQ_KEYS = ["bot", "autoReply", "risk", "payment", "account", "trial", "plans"] as const;

const GUIDE_LINKS = [
  { key: "schedule" as const, href: "/guides/schedule-line-openchat" },
  { key: "account" as const, href: "/guides/line-personal-vs-oa" },
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.meta");
  const tApp = await getTranslations("app");
  const siteUrl = getSiteUrl();
  const title = t("title");
  const description = t("description");
  const ogImage = `${siteUrl}/og.png`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: siteUrl },
    openGraph: {
      title,
      description,
      url: siteUrl,
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

export default async function LandingPage() {
  const t = await getTranslations("landing");
  const tApp = await getTranslations("app");
  const tGuides = await getTranslations("guides");
  const siteUrl = getSiteUrl();

  const featureKeys = [
    "schedule",
    "autoReply",
    "templates",
    "humanPace",
    "monitoring",
    "pacing",
    "control",
  ] as const;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Agenda",
      url: siteUrl,
      description: tApp("tagline"),
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Agenda",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: tApp("tagline"),
      url: siteUrl,
      offers: PAID_PLANS.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        price: plan.monthlyAmount,
        priceCurrency: "THB",
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_KEYS.map((key) => ({
        "@type": "Question",
        name: t(`faq.items.${key}.q`),
        acceptedAnswer: {
          "@type": "Answer",
          text: t(`faq.items.${key}.a`),
        },
      })),
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />

      <main className="flex-1">
        <section className="container py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-small font-medium uppercase tracking-wide text-muted-foreground">
              {t("hero.eyebrow")}
            </p>
            <h1 className="mt-4 text-display font-bold md:text-display-lg">
              {t("hero.title")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-body-lg text-muted-foreground">
              {t("hero.subtitle")}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">{t("hero.ctaPrimary")}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#how-it-works">{t("hero.ctaSecondary")}</Link>
              </Button>
            </div>
          </div>
          <div className="mx-auto mt-14 max-w-5xl">
            <div className="overflow-hidden rounded-xl border border-border/60 shadow-2xl">
              <Image
                src="/hero-light.png"
                alt={t("hero.title")}
                width={1200}
                height={675}
                className="w-full dark:hidden"
                priority
              />
              <Image
                src="/hero-dark.png"
                alt={t("hero.title")}
                width={1200}
                height={675}
                className="hidden w-full dark:block"
                priority
              />
            </div>
          </div>
        </section>

        <HowItWorksSection />

        <section id="features" className="border-t border-border bg-muted/30 py-20">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-h1 font-bold">{t("features.title")}</h2>
              <p className="mt-3 text-body text-muted-foreground">
                {t("features.subtitle")}
              </p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featureKeys.map((key) => {
                const Icon = FEATURE_ICONS[key];
                return (
                  <Card key={key} className="h-full">
                    <CardContent className="p-6">
                      <Icon
                        className="h-5 w-5 text-muted-foreground"
                        strokeWidth={1.75}
                      />
                      <h3 className="mt-4 text-h3 font-bold">
                        {t(`features.items.${key}.title`)}
                      </h3>
                      <p className="mt-2 text-small text-muted-foreground">
                        {t(`features.items.${key}.desc`)}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-20">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-h1 font-bold">{t("pricing.title")}</h2>
              <p className="mt-3 text-body text-muted-foreground">
                {t("pricing.subtitle")}
              </p>
              <p className="mx-auto mt-2 max-w-2xl text-small text-muted-foreground">
                {t("pricing.trialNote")}
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
              {PAID_PLANS.map((plan) => (
                <PricingPlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="border-t border-border bg-muted/30 py-20">
          <div className="container mx-auto max-w-3xl">
            <div className="text-center">
              <h2 className="text-h1 font-bold">{t("faq.title")}</h2>
              <p className="mt-3 text-body text-muted-foreground">
                {t("faq.subtitle")}
              </p>
            </div>
            <div className="mt-10 space-y-4">
              {FAQ_KEYS.map((key) => (
                <Card key={key}>
                  <CardContent className="p-6">
                    <h3 className="text-h3 font-bold">
                      {t(`faq.items.${key}.q`)}
                    </h3>
                    <p className="mt-2 text-small text-muted-foreground">
                      {t(`faq.items.${key}.a`)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border py-20">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-h1 font-bold">{t("learn.title")}</h2>
              <p className="mt-3 text-body text-muted-foreground">
                {t("learn.subtitle")}
              </p>
            </div>
            <div className="mx-auto mt-10 grid max-w-3xl gap-5 md:grid-cols-2">
              {GUIDE_LINKS.map(({ key, href }) => (
                <Link key={key} href={href} className="group">
                  <Card className="h-full transition-colors group-hover:border-primary">
                    <CardContent className="p-6">
                      <h3 className="text-h3 font-bold">
                        {tGuides(`cards.${key}.title`)}
                      </h3>
                      <p className="mt-2 text-small text-muted-foreground">
                        {tGuides(`cards.${key}.desc`)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Button asChild variant="outline">
                <Link href="/guides">{t("learn.cta")}</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto max-w-2xl text-center">
            <h2 className="text-h1 font-bold">{t("cta.title")}</h2>
            <p className="mt-3 text-body text-muted-foreground">
              {t("cta.subtitle")}
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link href="/signup">{t("cta.button")}</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-small text-muted-foreground sm:flex-row">
          <Logo />
          <div className="flex flex-col items-center gap-2 sm:items-end">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <Link href="/guides" className="hover:text-foreground">
                {t("footer.guides")}
              </Link>
              <Link href="/terms" className="hover:text-foreground">
                {t("footer.terms")}
              </Link>
              <Link href="/privacy" className="hover:text-foreground">
                {t("footer.privacy")}
              </Link>
            </div>
            <p>
              © {new Date().getFullYear()} {tApp("name")}. {t("footer.rights")}
            </p>
            <p>{t("footer.disclaimer")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
