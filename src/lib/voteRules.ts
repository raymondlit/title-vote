export type VotingRuleRow = {
  category_id: string | null;
  group_id: string | null;
  total_count: number;
  max_recommend: number;
  allow_abstain: boolean;
  require_all: boolean;
};

/**
 * 规则匹配优先级：类别+小组 > 类别 > 小组 > 全校默认。
 * 避免某个场次找不到精确规则时完全没有人数与推荐上限限制。
 */
export function pickVotingRule<T extends VotingRuleRow>(
  rules: T[] | null | undefined,
  categoryId: string | null,
  groupId: string | null,
): T | null {
  const list = rules ?? [];
  const match = (c: string | null, g: string | null) =>
    list.find((r) => (r.category_id ?? null) === c && (r.group_id ?? null) === g) ?? null;

  return (
    (categoryId && groupId ? match(categoryId, groupId) : null) ??
    (categoryId ? match(categoryId, null) : null) ??
    (groupId ? match(null, groupId) : null) ??
    match(null, null)
  );
}
