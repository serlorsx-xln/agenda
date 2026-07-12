"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, templates } from "@line/db";

import { recordAudit } from "@/lib/audit";
import { assertCanCreateTemplate } from "@/lib/plan-limits";
import { requireUser } from "@/lib/session";

const templateSchema = z
  .object({
    name: z.string().min(1).max(120),
    body: z.string().max(4000).optional().nullable(),
    imageAssetIds: z.array(z.string().uuid()).max(10).optional(),
  })
  .refine(
    (v) => Boolean(v.body?.trim()) || Boolean(v.imageAssetIds?.length),
    { message: "content_required" },
  );

export type ActionResult = { ok: boolean; error?: string };

export async function createTemplate(input: {
  name: string;
  body?: string | null;
  imageAssetIds?: string[];
}): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const limit = await assertCanCreateTemplate(user.id);
  if (!limit.ok) return { ok: false, error: limit.error };

  const imageAssetIds = parsed.data.imageAssetIds ?? [];

  const [row] = await db
    .insert(templates)
    .values({
      userId: user.id,
      name: parsed.data.name,
      body: parsed.data.body?.trim() || null,
      imageAssetIds,
    })
    .returning({ id: templates.id });

  await recordAudit(user.id, "template.create", {
    targetType: "template",
    targetId: row?.id,
  });
  revalidatePath("/dashboard/templates");
  return { ok: true };
}

export async function updateTemplate(input: {
  id: string;
  name: string;
  body?: string | null;
  imageAssetIds?: string[];
}): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const imageAssetIds = parsed.data.imageAssetIds ?? [];

  await db
    .update(templates)
    .set({
      name: parsed.data.name,
      body: parsed.data.body?.trim() || null,
      imageAssetIds,
      updatedAt: new Date(),
    })
    .where(and(eq(templates.id, input.id), eq(templates.userId, user.id)));

  await recordAudit(user.id, "template.update", {
    targetType: "template",
    targetId: input.id,
  });
  revalidatePath("/dashboard/templates");
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await db
    .delete(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, user.id)));
  await recordAudit(user.id, "template.delete", {
    targetType: "template",
    targetId: id,
  });
  revalidatePath("/dashboard/templates");
  return { ok: true };
}
