export type SearchableChat = {
  chatMid: string;
  name: string;
  kind?: string;
  present?: boolean;
};

/** Case-insensitive filter by display name or chat MID. */
export function filterChatsByQuery<T extends SearchableChat>(
  chats: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return chats;
  return chats.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.chatMid.toLowerCase().includes(q),
  );
}
