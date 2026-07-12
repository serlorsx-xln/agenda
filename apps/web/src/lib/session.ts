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

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const u = session.user as unknown as SessionUser;

  const [row] = await db
    .select({ banned: userTable.banned })
    .from(userTable)
    .where(eq(userTable.id, u.id))
    .limit(1);
  if (row?.banned) {
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
