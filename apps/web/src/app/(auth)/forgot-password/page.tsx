import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { redirectIfLoggedIn } from "@/lib/session";

export default async function ForgotPasswordPage() {
  await redirectIfLoggedIn();
  return <ForgotPasswordForm />;
}
