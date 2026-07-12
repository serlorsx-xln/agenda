import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { NavigationReset } from "@/components/dashboard/navigation-reset";
import { Topbar } from "@/components/dashboard/topbar";
import { PaywallBanner } from "@/components/billing/paywall-banner";
import { WorkerStatusBanner } from "@/components/dashboard/worker-status-banner";
import { ensureUserResources } from "@/lib/db-helpers";
import { getPlanUsage, syncSubscriptionLifecycle } from "@/lib/subscription-trial";
import { requireUser } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  await ensureUserResources(user.id);
  await syncSubscriptionLifecycle(user.id);
  const planUsage = await getPlanUsage(user.id);
  const isAdmin = user.role === "admin";

  return (
    <div className="flex h-dvh overflow-hidden">
      <NavigationReset />
      <Sidebar isAdmin={isAdmin} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar name={user.name} email={user.email} />
        <main className="flex-1 overflow-y-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 md:px-8 md:pb-10">
          <div className="mx-auto w-full max-w-6xl">
            <WorkerStatusBanner />
            <PaywallBanner usage={planUsage} />
            {children}
          </div>
        </main>
      </div>
      <MobileNav isAdmin={isAdmin} />
    </div>
  );
}
