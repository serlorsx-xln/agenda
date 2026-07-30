import { ne, inArray } from "drizzle-orm";

import { db } from "./client";
import {
  auditLog,
  signupRateLimits,
  user,
  verification,
} from "./schema";

export type ResetNonAdminUsersResult = {
  deletedCount: number;
  deleted: Array<{ id: string; name: string; email: string }>;
  remaining: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
};

/** Delete every non-admin user and cascaded app data. Keeps admin accounts. */
export async function resetNonAdminUsers(): Promise<ResetNonAdminUsersResult> {
  const nonAdminRows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(ne(user.role, "admin"));

  const nonAdminIds = nonAdminRows.map((row) => row.id);

  if (nonAdminIds.length > 0) {
    await db.delete(auditLog).where(inArray(auditLog.userId, nonAdminIds));
  }

  await db.delete(verification);
  await db.delete(signupRateLimits);

  const deleted =
    nonAdminIds.length > 0
      ? await db
          .delete(user)
          .where(ne(user.role, "admin"))
          .returning({ id: user.id, name: user.name, email: user.email })
      : [];

  const remaining = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })
    .from(user);

  return { deletedCount: deleted.length, deleted, remaining };
}

async function main() {
  const result = await resetNonAdminUsers();
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
