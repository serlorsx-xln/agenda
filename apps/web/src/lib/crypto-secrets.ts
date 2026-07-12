import { timingSafeEqual } from "node:crypto";

/** Constant-time string compare for secrets. */
export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function requireCronSecret(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    if (process.env.NODE_ENV === "production") return false;
    // Dev-only fallback.
    const fallback = process.env.INTERNAL_API_KEY?.trim();
    if (!fallback) return false;
    return checkHeader(request, fallback);
  }
  return checkHeader(request, expected);
}

function checkHeader(request: Request, expected: string): boolean {
  const header =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!header) return false;
  return secretsEqual(header, expected);
}

export function requireBillingWebhookSecret(request: Request): boolean {
  const expected = process.env.BILLING_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  const header =
    request.headers.get("x-billing-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!header) return false;
  return secretsEqual(header, expected);
}
