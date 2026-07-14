export type AutoReplyEmojiFilter = "any" | "with_emoji" | "without_emoji";
export type AutoReplyMatchMode = "contains" | "exact";

export type AutoReplyMatchInput = {
  includeKeywords: string[];
  excludeKeywords: string[];
  emojiFilter: AutoReplyEmojiFilter;
  matchMode: AutoReplyMatchMode;
};

const EMOJI_RE = /\p{Extended_Pictographic}/u;

export function normalizeKeywords(words: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const w = raw.trim();
    if (!w) continue;
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

export function normalizeChatMids(mids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of mids) {
    const mid = raw.trim();
    if (!mid || seen.has(mid)) continue;
    seen.add(mid);
    out.push(mid);
  }
  return out;
}

export function messageHasEmoji(text: string): boolean {
  return EMOJI_RE.test(text);
}

export function validateMatchInput(
  input: AutoReplyMatchInput,
): { ok: true; normalized: AutoReplyMatchInput } | { ok: false; error: string } {
  const includeKeywords = normalizeKeywords(input.includeKeywords);
  const excludeKeywords = normalizeKeywords(input.excludeKeywords);
  const emojiFilter = input.emojiFilter ?? "any";
  const matchMode = input.matchMode ?? "contains";

  if (includeKeywords.length === 0) {
    return { ok: false, error: "include_required" };
  }
  if (matchMode === "exact" && includeKeywords.length !== 1) {
    return { ok: false, error: "exact_single_keyword" };
  }

  return {
    ok: true,
    normalized: {
      includeKeywords,
      excludeKeywords,
      emojiFilter,
      matchMode,
    },
  };
}

export function messageMatchesRule(
  text: string,
  input: AutoReplyMatchInput,
): boolean {
  const includeKeywords = normalizeKeywords(input.includeKeywords);
  const excludeKeywords = normalizeKeywords(input.excludeKeywords);
  const emojiFilter = input.emojiFilter ?? "any";
  const matchMode = input.matchMode ?? "contains";

  if (includeKeywords.length === 0) return false;

  const hasEmoji = messageHasEmoji(text);
  if (emojiFilter === "with_emoji" && !hasEmoji) return false;
  if (emojiFilter === "without_emoji" && hasEmoji) return false;

  const hay = text.toLowerCase();
  for (const word of excludeKeywords) {
    if (hay.includes(word.toLowerCase())) return false;
  }

  if (matchMode === "exact") {
    if (includeKeywords.length !== 1) return false;
    return hay.trim() === includeKeywords[0]!.toLowerCase();
  }

  // Any listed keyword is enough (OR). Use one phrase as a single keyword for AND.
  return includeKeywords.some((w) => hay.includes(w.toLowerCase()));
}
