/** 大评审（委员会）场次相关的公共判断与查询 */

export const COMMITTEE_SCOPE = "committee";

export function isCommitteeSession(
  session: { voter_scope?: string | null } | null | undefined,
): boolean {
  return session?.voter_scope === COMMITTEE_SCOPE;
}

/** 线下学科组推荐通过的评审对象 id 集合（大评审场次的参评范围） */
export async function fetchRecommendedCandidateIds(
  client: any,
  schoolId: string,
  categoryId: string | null,
): Promise<Set<string>> {
  let query = client
    .from("offline_group_results")
    .select("candidate_id")
    .eq("school_id", schoolId)
    .eq("is_recommended", true);
  if (categoryId) query = query.eq("category_id", categoryId);
  const { data } = await query;
  return new Set((data ?? []).map((row: { candidate_id: string }) => row.candidate_id));
}
