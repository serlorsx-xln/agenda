import { Logo } from "@/components/brand/logo";
import { AuthMarketingAside } from "@/components/auth/auth-marketing-aside";
import { LanguageSwitcher } from "@/components/theme/language-switcher";
import { ModeToggle } from "@/components/theme/mode-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container flex h-16 items-center justify-between">
        <Logo />
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ModeToggle />
        </div>
      </header>
      <main className="container flex flex-1 items-center justify-center py-10">
        <div className="grid w-full max-w-4xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <AuthMarketingAside />
          <div className="w-full max-w-sm justify-self-center lg:max-w-md">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
