/** 评委投票页：表态状态筛选与「未表态人员快速定位」 */
export type VoteFilter = "all" | "pending" | "recommend" | "not_recommend";

/** Keyboard traversal stays within the currently visible, ordered list. */
export function adjacentCandidateId(ids: string[], current: string | null, direction: 1 | -1) {
  if (ids.length === 0) return null;
  const index = current ? ids.indexOf(current) : -1;
  if (index < 0) return direction === 1 ? ids[0] ?? null : ids[ids.length - 1] ?? null;
  return ids[Math.max(0, Math.min(ids.length - 1, index + direction))] ?? null;
}

export function voteKeyboardAction(key: string) {
  if (key === "1") return "recommend";
  if (key === "2") return "not_recommend";
  if (key === "ArrowDown" || key.toLowerCase() === "j") return "next";
  if (key === "ArrowUp" || key.toLowerCase() === "k") return "previous";
  if (key === " ") return "pending";
  return null;
}

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
    const id: string | undefined = orderedIds[(start + k) % n];
    if (id !== undefined && !choices[id]) return id;
  }
  return null;
}
