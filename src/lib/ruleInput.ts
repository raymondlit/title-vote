/** Matches the integer person counts stored by voting_rules. */
export function validRuleCounts(total: string, maximum: string): boolean {
  if (!/^\d+$/.test(total.trim()) || !/^\d+$/.test(maximum.trim())) return false;
  const count = Number(total);
  const max = Number(maximum);
  return Number.isSafeInteger(count) && count >= 1 && count <= 2147483647 &&
    Number.isSafeInteger(max) && max >= 1 && max <= count;
}