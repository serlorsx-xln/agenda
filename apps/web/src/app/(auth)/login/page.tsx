import { LoginForm } from "@/components/auth/login-form";
import { redirectIfLoggedIn } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  await redirectIfLoggedIn();
  return <LoginForm banned={params.error === "banned"} />;
}
