/** 评委投票页：表态状态筛选与「未表态人员快速定位」 */
export type VoteFilter = "all" | "pending" | "recommend" | "not_recommend";

export function matchesFilter(choice: string | undefined, filter: VoteFilter): boolean {
  if (filter === "all") return true;
  if (filter === "pending") return !choice;
  return choice === filter;
}

/**
 * 下一个未表态人员：从当前定位人员之后开始查找，到末尾后回到开头循环。
 * 全部已表态时返回 null。
 */
export function nextPendingId(
  orderedIds: string[],
  choices: Record<string, string | undefined>,
  afterId: string | null,
): string | null {
  const n = orderedIds.length;
  if (n === 0) return null;
  const start = afterId ? orderedIds.indexOf(afterId) + 1 : 0;
  for (let k = 0; k < n; k++) {
    const id = orderedIds[(start + k) % n]!;
    if (!choices[id]) return id;
  }
  return null;
}
