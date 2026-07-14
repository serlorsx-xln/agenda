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

/** Report an error to Sentry (if configured) and Discord (slynxslip-style embed). */
export async function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const service =
    typeof context?.service === "string"
      ? context.service
      : process.env.SERVICE_NAME || "agenda";

  if (process.env.SENTRY_DSN) {
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
      // Sentry optional - never block request paths.
    }
  }

  try {
    const { notifyDiscord } = await import("./discord-notify.js");
    const message =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : typeof err === "string"
          ? err
          : "Unknown error";
    const detailParts: string[] = [];
    if (err instanceof Error && err.stack) {
      detailParts.push(err.stack.slice(0, 1500));
    }
    if (context) {
      detailParts.push(
        Object.entries(context)
          .filter(([k]) => k !== "service")
          .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join("\n")
          .slice(0, 800),
      );
    }
    void notifyDiscord({
      service,
      title: "error",
      description: message.slice(0, 400),
      status: "ERROR",
      detail: detailParts.filter(Boolean).join("\n\n").slice(0, 1800) || undefined,
    });
  } catch {
    // Discord optional - never block.
  }
}

/** Startup ping — same embed chrome as slynxslip. */
export async function notifyStartup(service: string): Promise<void> {
  try {
    const { notifyDiscord } = await import("./discord-notify.js");
    await notifyDiscord({
      service,
      title: "startup",
      description: "Process started",
      status: "STARTUP",
    });
  } catch {
    // optional
  }
}
