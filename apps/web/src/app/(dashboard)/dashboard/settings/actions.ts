"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, user as userTable } from "@line/db";

import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/session";

export type ActionResult = { ok: boolean; error?: string };

const profileSchema = z.object({ name: z.string().min(1).max(120) });

export async function updateProfile(input: {
  name: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  await db
    .update(userTable)
    .set({ name: parsed.data.name, updatedAt: new Date() })
    .where(eq(userTable.id, user.id));

  await recordAudit(user.id, "profile.update");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
