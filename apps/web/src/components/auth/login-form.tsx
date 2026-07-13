"use client";

import { IconLoader } from "@/lib/icons";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTranslations } from "next-intl";

import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ banned = false }: { banned?: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(
    banned ? t("errors.banned") : null,
  );

  const schema = z.object({
    email: z.string().email(t("errors.emailInvalid")),
    password: z.string().min(1, t("errors.generic")),
  });
  type Values = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    setFormError(null);
    const { error } = await signIn.email({
      email: values.email,
      password: values.password,
    });
    if (error) {
      const code = (error.code ?? error.message ?? "").toLowerCase();
      if (code.includes("banned") || code.includes("forbidden")) {
        setFormError(t("errors.banned"));
      } else {
        setFormError(t("errors.invalidCredentials"));
      }
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h2">{t("login.title")}</CardTitle>
        <CardDescription>{t("login.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("fields.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-caption text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t("fields.password")}</Label>
              <Link
                href="/forgot-password"
                className="text-caption text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("login.forgotPassword")}
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
          </div>

          {formError && (
            <p className="text-small text-destructive" role="alert">
              {formError}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <IconLoader className="h-4 w-4 animate-spin" />}
            {t("login.submit")}
          </Button>
        </form>

        <p className="mt-6 text-center text-small text-muted-foreground">
          {t("login.noAccount")}{" "}
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t("login.signupLink")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
