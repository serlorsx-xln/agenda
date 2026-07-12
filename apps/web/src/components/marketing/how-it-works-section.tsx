import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarClock } from "lucide-react";
import {
  IconConnect,
  IconSend,
  IconTemplate,
} from "@/lib/icons";

const STEPS = [
  { key: "connect", icon: IconConnect },
  { key: "template", icon: IconTemplate },
  { key: "campaign", icon: CalendarClock },
  { key: "send", icon: IconSend },
] as const;

export async function HowItWorksSection() {
  const t = await getTranslations("landing.howItWorks");

  return (
    <section id="how-it-works" className="border-t border-border py-20">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-h1 font-bold">{t("title")}</h2>
          <p className="mt-3 text-body text-muted-foreground">{t("subtitle")}</p>
        </div>
        <ol className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.key}>
                <Card className="h-full">
                  <CardContent className="flex gap-4 p-5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-small font-bold text-primary">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <Icon
                        className="mb-2 h-5 w-5 text-muted-foreground"
                        strokeWidth={1.75}
                      />
                      <h3 className="text-h3 font-bold">
                        {t(`steps.${step.key}.title`)}
                      </h3>
                      <p className="mt-1 text-small text-muted-foreground">
                        {t(`steps.${step.key}.desc`)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
        <div className="mt-10 text-center">
          <Button asChild size="lg">
            <Link href="/signup">{t("cta")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
