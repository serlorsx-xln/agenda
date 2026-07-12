export type RuleChatMids = {
  id: string;
  chatMids: string[];
  enabled: boolean;
};

export type PruneRuleUpdate = {
  id: string;
  chatMids: string[];
  disable: boolean;
};

/** Exported for unit tests. */
export function pruneAbsentChatMidsFromRules(
  rules: RuleChatMids[],
  absentMids: Set<string>,
): PruneRuleUpdate[] {
  const updates: PruneRuleUpdate[] = [];
  for (const rule of rules) {
    const nextMids = rule.chatMids.filter((mid) => !absentMids.has(mid));
    if (nextMids.length === rule.chatMids.length) continue;
    updates.push({
      id: rule.id,
      chatMids: nextMids,
      disable: nextMids.length === 0,
    });
  }
  return updates;
}
