import { db, signupRateLimits } from "@line/db";
import { eq } from "drizzle-orm";

const SIGNUP_LIMIT = 5;
const LOGIN_LIMIT = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headers.get("x-real-ip") ?? "unknown";
}

/** Returns false when the IP exceeded signup quota for the rolling window. */
export async function checkSignupRateLimit(ip: string): Promise<boolean> {
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - WINDOW_MS);

  const [row] = await db
    .select()
    .from(signupRateLimits)
    .where(eq(signupRateLimits.ip, ip))
    .limit(1);

  if (!row || row.windowStart < windowCutoff) {
    await db
      .insert(signupRateLimits)
      .values({ ip, count: 1, windowStart: now })
      .onConflictDoUpdate({
        target: signupRateLimits.ip,
        set: { count: 1, windowStart: now },
      });
    return true;
  }

  if (row.count >= SIGNUP_LIMIT) return false;

  await db
    .update(signupRateLimits)
    .set({ count: row.count + 1 })
    .where(eq(signupRateLimits.ip, ip));

  return true;
}

/** Returns false when the IP exceeded login attempts for the rolling window. */
export async function checkLoginRateLimit(ip: string): Promise<boolean> {
  const key = `login:${ip}`;
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - LOGIN_WINDOW_MS);

  const [row] = await db
    .select()
    .from(signupRateLimits)
    .where(eq(signupRateLimits.ip, key))
    .limit(1);

  if (!row || row.windowStart < windowCutoff) {
    await db
      .insert(signupRateLimits)
      .values({ ip: key, count: 1, windowStart: now })
      .onConflictDoUpdate({
        target: signupRateLimits.ip,
        set: { count: 1, windowStart: now },
      });
    return true;
  }

  if (row.count >= LOGIN_LIMIT) return false;

  await db
    .update(signupRateLimits)
    .set({ count: row.count + 1 })
    .where(eq(signupRateLimits.ip, key));

  return true;
}
