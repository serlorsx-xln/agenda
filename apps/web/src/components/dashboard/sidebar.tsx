"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Logo } from "@/components/brand/logo";
import { DashboardNavLink } from "@/components/dashboard/dashboard-nav-link";
import {
  ADMIN_NAV,
  PRIMARY_NAV,
  type NavItem,
} from "@/components/dashboard/nav-config";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const items: NavItem[] = isAdmin
    ? [...PRIMARY_NAV, ...ADMIN_NAV]
    : PRIMARY_NAV;

  return (
    <aside className="relative z-[60] hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-card pointer-events-auto md:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-border px-6">
        <Logo href="/dashboard" />
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <DashboardNavLink
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-small font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {t(item.key)}
            </DashboardNavLink>
          );
        })}
      </nav>
    </aside>
  );
}
