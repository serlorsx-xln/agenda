import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { redirectIfLoggedIn } from "@/lib/session";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  await redirectIfLoggedIn();

  const params = await searchParams;
  const token =
    params.error === "INVALID_TOKEN" ? undefined : params.token;

  return <ResetPasswordForm token={token} />;
}
