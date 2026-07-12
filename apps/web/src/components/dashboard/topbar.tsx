import { LanguageSwitcher } from "@/components/theme/language-switcher";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { UserMenu } from "@/components/dashboard/user-menu";
import { Logo } from "@/components/brand/logo";

export function Topbar({ name, email }: { name: string; email: string }) {
  return (
    <header className="z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="md:hidden">
        <Logo href="/dashboard" />
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        <ModeToggle />
        <div className="ml-1">
          <UserMenu name={name} email={email} />
        </div>
      </div>
    </header>
  );
}
