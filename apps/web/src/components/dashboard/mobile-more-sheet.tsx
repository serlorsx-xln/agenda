"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { DashboardNavLink } from "@/components/dashboard/dashboard-nav-link";
import { MOBILE_MORE_NAV } from "@/components/dashboard/nav-config";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileMoreSheet({
  open,
  onOpenChange,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  const items = MOBILE_MORE_NAV.filter(
    (item) => !item.adminOnly || isAdmin,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bottom-0 top-auto max-w-lg translate-y-0 rounded-b-none sm:bottom-auto sm:top-[50%] sm:translate-y-[-50%] sm:rounded-b-lg">
        <DialogHeader>
          <DialogTitle>{t("more")}</DialogTitle>
        </DialogHeader>
        <nav className="grid gap-1 py-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <DashboardNavLink
                key={item.key}
                href={item.href}
                onNavigate={() => onOpenChange(false)}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-body",
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                {t(item.key)}
              </DashboardNavLink>
            );
          })}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
