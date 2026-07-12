/** Optional Sentry initialization when SENTRY_DSN is configured. */
export async function initSentry(service: string): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0.1,
      initialScope: { tags: { service } },
    });
  } catch (err) {
    console.warn(
      `[observability] Sentry init skipped for ${service}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Report an error to Sentry when configured; no-op otherwise. */
export async function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.withScope((scope) => {
      if (context) {
        for (const [key, value] of Object.entries(context)) {
          scope.setExtra(key, value);
        }
      }
      Sentry.captureException(err);
    });
  } catch {
    // Sentry optional — never block request paths.
  }
}
