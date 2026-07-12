import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  if (
    process.env.NODE_ENV === "production" &&
    name === "INTERNAL_API_KEY" &&
    value.length < 16
  ) {
    throw new Error("INTERNAL_API_KEY must be at least 16 characters in production");
  }
  return value;
}

function requireProd(name: string): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env[name]?.trim()) {
    throw new Error(`Missing required production env var: ${name}`);
  }
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  INTERNAL_API_KEY: required("INTERNAL_API_KEY"),
  WORKER_PORT: Number(process.env.WORKER_PORT ?? 4000),
  LINE_DEVICE: (process.env.LINE_DEVICE ?? "ANDROIDSECONDARY") as
    | "ANDROIDSECONDARY"
    | "IOSIPAD"
    | "DESKTOPWIN"
    | "ANDROID",
  SESSION_DIR: path.dirname(
    process.env.LINE_SESSION_PATH ?? "/data/session/session.json",
  ),
  SCHEDULER_TICK_SECONDS: Number(process.env.SCHEDULER_TICK_SECONDS ?? 30),
  /** Max LINE clients kept in RAM at once (hibernate LRU beyond this). */
  MAX_HOT_SESSIONS: Number(process.env.MAX_HOT_SESSIONS ?? 200),
  /** Hibernate idle in-memory clients after this many ms (0 = disabled). */
  SESSION_IDLE_EVICT_MS: Number(process.env.SESSION_IDLE_EVICT_MS ?? 300_000),
  /** How many sessions to restore on worker boot (0 = lazy resume only). */
  MAX_BOOT_RESTORE_SESSIONS: Number(
    process.env.MAX_BOOT_RESTORE_SESSIONS ?? 1,
  ),
  /** Target seconds to poll every auto-reply user once (coordinator mode). */
  AUTO_REPLY_CYCLE_SEC: Number(process.env.AUTO_REPLY_CYCLE_SEC ?? 30),
  /** Coordinator tick interval in ms. */
  AUTO_REPLY_TICK_MS: Number(process.env.AUTO_REPLY_TICK_MS ?? 100),
  /** Hibernate client after each auto-reply poll to save RAM at scale. */
  HIBERNATE_AFTER_AUTO_REPLY_POLL:
    process.env.HIBERNATE_AFTER_AUTO_REPLY_POLL !== "false",
};

if (process.env.NODE_ENV === "production") {
  requireProd("SESSION_ENCRYPTION_KEY");
}
