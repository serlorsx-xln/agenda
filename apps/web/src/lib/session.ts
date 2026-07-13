import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db, user as userTable } from "@line/db";

import { auth } from "@/lib/auth";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  image?: string | null;
};

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

async function isUserBanned(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ banned: userTable.banned })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return Boolean(row?.banned);
}

/** Clear the current session cookie (best-effort). */
export async function signOutCurrentSession(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Session may already be invalid; ignore.
  }
}

/**
 * Auth pages call this so logged-in users go to the dashboard —
 * unless they are banned (sign out and stay on the auth page).
 */
export async function redirectIfLoggedIn(to = "/dashboard"): Promise<void> {
  const session = await getSession();
  if (!session?.user) return;

  const u = session.user as { id: string };
  if (await isUserBanned(u.id)) {
    await signOutCurrentSession();
    return;
  }

  redirect(to);
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const u = session.user as unknown as SessionUser;

  if (await isUserBanned(u.id)) {
    await signOutCurrentSession();
    redirect("/login?error=banned");
  }

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role ?? "user",
    image: u.image,
  };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    redirect("/dashboard");
  }
  return user;
}
