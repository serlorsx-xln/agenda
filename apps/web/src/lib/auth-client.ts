"use client";

import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Prefer same-origin in the browser. Docker `next build` bakes
  // NEXT_PUBLIC_APP_URL from Dockerfile placeholders (localhost), which
  // breaks login/signup when the real host differs (Coolify / custom domain).
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? undefined),
  plugins: [adminClient()],
});

export const signIn = authClient.signIn;
export const signUp = authClient.signUp;
export const signOut = authClient.signOut;
