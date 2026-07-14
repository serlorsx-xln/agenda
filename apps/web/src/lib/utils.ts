import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import { DEFAULT_CAMPAIGN_TIMEZONE } from "@line/shared/timezone";

/** Custom type scale uses `text-*` for font size; teach tailwind-merge not to drop colors. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-caption",
        "text-small",
        "text-body",
        "text-body-lg",
        "text-h3",
        "text-h2",
        "text-h1",
        "text-display",
        "text-display-lg",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Display timestamps always in Asia/Bangkok (Agenda product clock). */
export function formatDate(
  date: Date | string | null | undefined,
  locale = "th",
): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    timeZone: DEFAULT_CAMPAIGN_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function formatTHB(satangOrBaht: number, isBaht = true): string {
  const amount = isBaht ? satangOrBaht : satangOrBaht / 100;
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Convert whole-baht plan prices to satang for DB storage. */
export function thbToSatang(baht: number): number {
  return Math.round(baht * 100);
}
