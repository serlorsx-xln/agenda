import type { Metadata } from "next";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { Providers } from "@/components/providers";
import { getSiteUrl } from "@/lib/site-url";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  const siteUrl = getSiteUrl();
  const title = t("name");
  const description = t("tagline");
  const ogImage = `${siteUrl}/opengraph-image`;

  return {
    title: {
      default: title,
      template: `%s · ${title}`,
    },
    description,
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#358F7A" },
      { media: "(prefers-color-scheme: dark)", color: "#52A894" },
    ],
    metadataBase: new URL(siteUrl),
    alternates: { canonical: siteUrl },
    openGraph: {
      type: "website",
      locale: "th_TH",
      alternateLocale: ["en_US"],
      url: siteUrl,
      siteName: title,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Providers locale={locale} messages={messages} timeZone="Asia/Bangkok">
          {children}
        </Providers>
      </body>
    </html>
  );
}
