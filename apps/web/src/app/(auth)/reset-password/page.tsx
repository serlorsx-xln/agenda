import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getSession } from "@/lib/session";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");

  const params = await searchParams;
  const token =
    params.error === "INVALID_TOKEN" ? undefined : params.token;

  return <ResetPasswordForm token={token} />;
}
