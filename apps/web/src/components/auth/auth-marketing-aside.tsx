import { getTranslations } from "next-intl/server";

import { Check } from "lucide-react";

export async function AuthMarketingAside() {
  const t = await getTranslations("auth.aside");
  const bullets = ["schedule", "progress", "trial"] as const;

  return (
    <aside className="hidden max-w-md lg:block">
      <p className="text-h2 font-bold">{t("tagline")}</p>
      <ul className="mt-6 space-y-4">
        {bullets.map((key) => (
          <li key={key} className="flex gap-3">
            <Check
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              strokeWidth={2}
            />
            <span className="text-body text-muted-foreground">
              {t(`bullets.${key}`)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-small text-muted-foreground">{t("trialNote")}</p>
    </aside>
  );
}
