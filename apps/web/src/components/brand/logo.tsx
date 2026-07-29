"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export function Logo({
  className,
  href = "/",
  showWordmark = true,
}: {
  className?: string;
  href?: string;
  showWordmark?: boolean;
}) {
  const t = useTranslations("app");

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 font-bold tracking-tight text-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-primary shadow-[inset_0_1px_0_0_hsl(var(--primary-foreground)/0.12)]"
      >
        <span className="h-1.5 w-1.5 rounded-[1px] bg-primary-foreground/90" />
      </span>
      {showWordmark ? (
        <span className="text-body-lg leading-none">{t("name")}</span>
      ) : null}
    </Link>
  );
}
