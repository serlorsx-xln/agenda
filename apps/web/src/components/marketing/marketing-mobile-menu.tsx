"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const LINKS = [
  { key: "howItWorks", href: "/#how-it-works" },
  { key: "features", href: "/#features" },
  { key: "pricing", href: "/#pricing" },
  { key: "faq", href: "/#faq" },
  { key: "guides", href: "/guides" },
  { key: "contact", href: "/#contact" },
] as const;

export function MarketingMobileMenu({ isLoggedIn }: { isLoggedIn?: boolean }) {
  const t = useTranslations("nav");
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label={t("more")}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              <Logo />
            </DialogTitle>
          </DialogHeader>
          <nav className="flex flex-col gap-1 py-2">
            {LINKS.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-md px-3 py-2.5 text-body text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {t(link.key)}
              </Link>
            ))}
            <hr className="my-1 border-border" />
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-md px-3 py-2.5 text-body font-medium text-primary hover:bg-muted"
              >
                {t("dashboard")}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="min-h-11 rounded-md px-3 py-2.5 text-body hover:bg-muted"
                >
                  {t("login")}
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="min-h-11 rounded-md px-3 py-2.5 text-body font-medium text-primary hover:bg-muted"
                >
                  {t("signup")}
                </Link>
              </>
            )}
          </nav>
        </DialogContent>
      </Dialog>
    </>
  );
}
