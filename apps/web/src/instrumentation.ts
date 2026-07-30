export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initSentry, notifyStartup } = await import("@line/shared/sentry");
    await initSentry("web");
    void notifyStartup("web");

    if (process.env.RUN_RESET_NON_ADMIN === "1") {
      try {
        const { resetNonAdminUsers } = await import("@line/db/reset-non-admin");
        const result = await resetNonAdminUsers();
        console.log(
          "[ops] reset-non-admin completed",
          JSON.stringify({
            deletedCount: result.deletedCount,
            remaining: result.remaining.map((u) => u.email),
          }),
        );
      } catch (err) {
        console.error("[ops] reset-non-admin failed", err);
      }
    }
  }
}
