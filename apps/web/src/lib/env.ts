/** True while Next.js is collecting page data for `next build`. */
export function isNextBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/** Validate required web env vars at server startup (not during image build). */
export function validateWebEnv(): void {
  if (isNextBuildPhase()) return;

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing required env var: BETTER_AUTH_SECRET");
  }
  if (secret.startsWith("build_time_placeholder")) {
    throw new Error(
      "BETTER_AUTH_SECRET is still a build placeholder; set a real secret in .env",
    );
  }
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET must be at least 32 characters in production",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing required env var: DATABASE_URL");
  }
  if (!process.env.INTERNAL_API_KEY) {
    throw new Error("Missing required env var: INTERNAL_API_KEY");
  }

  if (process.env.NODE_ENV === "production") {
    for (const name of [
      "PROMPTPAY_ID",
      "SCB_SLIP_URL",
      "SCB_API_KEY",
      "BILLING_WEBHOOK_SECRET",
      "CRON_SECRET",
    ] as const) {
      if (!process.env[name]?.trim()) {
        throw new Error(`Missing required production env var: ${name}`);
      }
    }
    if (process.env.PROMPTPAY_ID === "0000000000") {
      throw new Error("PROMPTPAY_ID must be a real promptpay id in production");
    }
  }
}
