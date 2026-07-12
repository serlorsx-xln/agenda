import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/brand/logo";
import { MarketingMobileMenu } from "@/components/marketing/marketing-mobile-menu";
import { LanguageSwitcher } from "@/components/theme/language-switcher";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";

export async function SiteHeader() {
  const t = await getTranslations("nav");
  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="/#how-it-works"
              className="text-small text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("howItWorks")}
            </Link>
            <Link
              href="/#features"
              className="text-small text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("features")}
            </Link>
            <Link
              href="/#pricing"
              className="text-small text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("pricing")}
            </Link>
            <Link
              href="/#faq"
              className="text-small text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("faq")}
            </Link>
            <Link
              href="/guides"
              className="text-small text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("guides")}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <MarketingMobileMenu isLoggedIn={isLoggedIn} />
          <LanguageSwitcher />
          <ModeToggle />
          <div className="ml-2 hidden items-center gap-2 md:flex">
            {isLoggedIn ? (
              <Button asChild size="sm">
                <Link href="/dashboard">{t("dashboard")}</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">{t("login")}</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">{t("signup")}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
