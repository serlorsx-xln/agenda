import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SEC = 120;

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Short-lived HMAC token binding a request to a specific userId. */
export function createWorkerUserToken(userId: string, secret: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payload = `${userId}:${exp}`;
  return `${payload}.${signPayload(payload, secret)}`;
}

export function verifyWorkerUserToken(
  token: string,
  secret: string,
): { userId: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signPayload(payload, secret);
  if (!safeEqual(sig, expected)) return null;

  const colon = payload.indexOf(":");
  if (colon <= 0) return null;
  const userId = payload.slice(0, colon);
  const exp = Number(payload.slice(colon + 1));
  if (!userId || !Number.isFinite(exp)) return null;
  if (exp < Math.floor(Date.now() / 1000)) return null;

  return { userId };
}

export function extractLineUserIdFromPath(path: string): string | undefined {
  const match = path.match(/^\/line\/([^/]+)/);
  return match?.[1];
}
