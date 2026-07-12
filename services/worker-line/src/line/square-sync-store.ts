import { and, eq, inArray } from "drizzle-orm";

import { db, lineChats } from "@line/db";

export async function loadSquareSyncTokens(
  userId: string,
  chatMids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!chatMids.length) return map;
  const rows = await db
    .select({
      chatMid: lineChats.chatMid,
      token: lineChats.squareSyncToken,
    })
    .from(lineChats)
    .where(
      and(
        eq(lineChats.userId, userId),
        inArray(lineChats.chatMid, chatMids),
      ),
    );
  for (const row of rows) {
    if (row.token) map.set(row.chatMid, row.token);
  }
  return map;
}

export async function persistSquareSyncToken(
  userId: string,
  chatMid: string,
  token: string,
): Promise<void> {
  await db
    .update(lineChats)
    .set({ squareSyncToken: token })
    .where(
      and(eq(lineChats.userId, userId), eq(lineChats.chatMid, chatMid)),
    );
}
