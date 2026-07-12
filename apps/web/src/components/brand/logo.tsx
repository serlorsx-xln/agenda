"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string;
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
        className="inline-block h-4 w-4 rounded-[4px] border-2 border-primary"
      />
      <span className="text-body-lg leading-none">{t("name")}</span>
    </Link>
  );
}
