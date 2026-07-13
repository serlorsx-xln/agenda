import { SignupForm } from "@/components/auth/signup-form";
import { redirectIfLoggedIn } from "@/lib/session";

export default async function SignupPage() {
  await redirectIfLoggedIn();
  return <SignupForm />;
}
