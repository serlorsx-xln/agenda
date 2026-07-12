"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { updateProfile } from "@/app/(dashboard)/dashboard/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { localeNames, locales, type Locale } from "@/i18n/config";
import { setLocale } from "@/i18n/locale";

export function SettingsClient({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const t = useTranslations("settings");

  return (
    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">{t("tabs.profile")}</TabsTrigger>
        <TabsTrigger value="appearance">{t("tabs.appearance")}</TabsTrigger>
      </TabsList>

      <TabsContent value="profile">
        <ProfileTab initialName={initialName} email={email} />
      </TabsContent>

      <TabsContent value="appearance">
        <AppearanceTab />
      </TabsContent>
    </Tabs>
  );
}

function ProfileTab({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const t = useTranslations("settings.profile");
  const tt = useTranslations("toast");
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await updateProfile({ name });
      if (!res.ok) throw new Error(res.error);
      toast.success(tt("saved"));
      router.refresh();
    } catch {
      toast.error(tt("error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="max-w-md space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">{t("name")}</Label>
          <Input
            id="p-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-email">{t("email")}</Label>
          <Input id="p-email" value={email} disabled readOnly />
          <p className="text-caption text-muted-foreground">
            {t("emailReadonly")}
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}

function AppearanceTab() {
  const t = useTranslations("settings.appearance");
  const tt = useTranslations("toast");
  const router = useRouter();
  const locale = useLocale() as Locale;
  const { theme, setTheme } = useTheme();
  const [pending, startTransition] = React.useTransition();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  function changeLocale(next: Locale) {
    startTransition(async () => {
      await setLocale(next);
      toast.success(tt("localeChanged"));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-2 sm:max-w-xs">
          <Label>{t("language")}</Label>
          <Select
            value={locale}
            onChange={(e) => changeLocale(e.target.value as Locale)}
            disabled={pending}
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {localeNames[l]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2 sm:max-w-xs">
          <Label>{t("theme")}</Label>
          <Select
            value={mounted ? (theme ?? "system") : "system"}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="light">{t("themeLight")}</option>
            <option value="dark">{t("themeDark")}</option>
            <option value="system">{t("themeSystem")}</option>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
