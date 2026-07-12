export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initSentry } = await import("@line/shared/sentry");
    await initSentry("web");
  }
}
