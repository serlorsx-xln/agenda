"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { MobileMoreSheet } from "@/components/dashboard/mobile-more-sheet";
import { DashboardNavLink } from "@/components/dashboard/dashboard-nav-link";
import {
  MOBILE_MORE_ICON,
  MOBILE_PRIMARY_NAV,
} from "@/components/dashboard/nav-config";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isMoreRoute(pathname: string): boolean {
  const morePrefixes = [
    "/dashboard/connect",
    "/dashboard/templates",
    "/dashboard/runs",
    "/dashboard/billing",
    "/dashboard/settings",
    "/dashboard/admin",
  ];
  return morePrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreActive = isMoreRoute(pathname);

  React.useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="pointer-events-auto fixed inset-x-0 bottom-0 z-[60] grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE_PRIMARY_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <DashboardNavLink
              key={item.key}
              href={item.href}
              className={cn(
                "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 text-caption",
                active ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
              <span className="max-w-full truncate">{t(item.key)}</span>
            </DashboardNavLink>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 text-caption",
            moreActive || moreOpen
              ? "font-medium text-primary"
              : "text-muted-foreground",
          )}
        >
          <MOBILE_MORE_ICON className="h-5 w-5 shrink-0" strokeWidth={1.75} />
          <span className="max-w-full truncate">{t("more")}</span>
        </button>
      </nav>
      <MobileMoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        isAdmin={isAdmin}
      />
    </>
  );
}
