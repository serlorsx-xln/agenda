"use client";

import { IconLoader } from "@/lib/icons";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTranslations } from "next-intl";

import { authClient } from "@/lib/auth-client";
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

export function ResetPasswordForm({ token }: { token?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);

  const schema = z
    .object({
      password: z.string().min(8, t("errors.passwordShort")),
      confirmPassword: z.string(),
    })
    .refine((v) => v.password === v.confirmPassword, {
      message: t("errors.passwordMismatch"),
      path: ["confirmPassword"],
    });
  type Values = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-h2">{t("resetPassword.title")}</CardTitle>
          <CardDescription>{t("resetPassword.invalidToken")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/forgot-password">{t("resetPassword.requestNew")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  async function onSubmit(values: Values) {
    setFormError(null);
    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    });
    if (error) {
      setFormError(t("resetPassword.invalidToken"));
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h2">{t("resetPassword.title")}</CardTitle>
        <CardDescription>{t("resetPassword.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("fields.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-caption text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">
              {t("fields.confirmPassword")}
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="text-caption text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {formError && (
            <p className="text-small text-destructive" role="alert">
              {formError}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <IconLoader className="h-4 w-4 animate-spin" />}
            {t("resetPassword.submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
