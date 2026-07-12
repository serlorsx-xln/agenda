import { db, queryClient } from "./client";
import { appSettings } from "./schema";

/**
 * Seed only scaffold/settings data. Intentionally creates NO default LINE
 * targets, NO campaigns, and NO templates so a fresh install starts empty.
 */
async function main() {
  console.log("Seeding app settings scaffold...");

  await db
    .insert(appSettings)
    .values([
      {
        id: "billing.plans",
        value: {
          currency: "THB",
          plans: [
            {
              id: "starter",
              name: "Basic",
              monthlyAmount: 79,
              maxCampaigns: 2,
              maxTargetsPerCampaign: 10,
            },
            {
              id: "growth",
              name: "Growth",
              monthlyAmount: 149,
              maxCampaigns: 5,
              maxTargetsPerCampaign: 30,
            },
            {
              id: "pro",
              name: "Pro",
              monthlyAmount: 249,
              maxCampaigns: 20,
              maxTargetsPerCampaign: 100,
            },
          ],
        },
      },
      {
        id: "safety.defaults",
        value: {
          delayBetweenTargetsSec: 45,
          randomJitterSec: 30,
          autoStopOnErrors: 3,
          maxSendsPerDay: 50,
        },
      },
      {
        id: "payment.provider",
        value: { provider: "promptpay", integration: "scb_slip" },
      },
    ])
    .onConflictDoNothing({ target: appSettings.id });

  console.log("Seed complete.");
  await queryClient.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
