import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { checkLoginRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";

const handler = toNextJsHandler(auth);

async function guardLoginRateLimit(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.includes("/sign-in/email")) return null;
  const ip = getClientIpFromHeaders(request.headers);
  if (await checkLoginRateLimit(ip)) return null;
  return Response.json(
    { message: "Too many login attempts. Please try again later." },
    { status: 429 },
  );
}

export async function GET(request: Request) {
  return handler.GET(request);
}

export async function POST(request: Request) {
  const blocked = await guardLoginRateLimit(request);
  if (blocked) return blocked;
  return handler.POST(request);
}
