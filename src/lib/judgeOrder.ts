import { fetchRecommendedCandidateIds } from "@/lib/committee";
import { hasFixedPool } from "@/lib/rounds";

export type JudgeCandidate = {
  id: string;
  full_name: string;
  unit: string | null;
  current_title: string | null;
  group_id: string | null;
  sort_order: number;
  agree_votes: number | null;
  total_votes: number | null;
};

type SessionLike = {
  school_id: string;
  category_id: string | null;
  group_id: string | null;
  voter_scope: string | null;
  candidate_ids?: string[] | null;
};

/**
 * 评委端名单排序（纯函数，可测试）：
 * 多个学科组时按组名分组（未分组排最后）；组内推荐票数高者在前，
 * 票数相同按管理员设定的顺序，再按姓名。
 */
export function orderJudgeCandidates<T extends Omit<JudgeCandidate, "unit" | "current_title">>(
  list: T[],
  groupName: Map<string, string>,
): T[] {
  const cmp = (a: T, b: T) =>
    (b.agree_votes ?? 0) - (a.agree_votes ?? 0) ||
    (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
    a.full_name.localeCompare(b.full_name, "zh-CN");
  const multiGroup = new Set(list.map((c) => c.group_id ?? "none")).size > 1;
  if (!multiGroup) return [...list].sort(cmp);
  const byGroup = new Map<string | null, T[]>();
  for (const c of list) {
    const key = c.group_id ?? null;
    byGroup.set(key, [...(byGroup.get(key) ?? []), c]);
  }
  const NONE = "\uffff";
  return [...byGroup.entries()]
    .sort(([a], [b]) =>
      (a ? (groupName.get(a) ?? "") : NONE).localeCompare(
        b ? (groupName.get(b) ?? "") : NONE,
        "zh-CN",
      ),
    )
    .flatMap(([, arr]) => [...arr].sort(cmp));
}

/** 按评委端规则加载某场次的评审对象名单（评委投票页与管理端预览共用） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadJudgeCandidates(client: any, vs: SessionLike) {
  const cols = "id, full_name, unit, current_title, group_id, sort_order";
  let base: Omit<JudgeCandidate, "agree_votes" | "total_votes">[];
  if (hasFixedPool(vs)) {
    const { data } = await client
      .from("candidates")
      .select(cols)
      .eq("school_id", vs.school_id)
      .in("id", vs.candidate_ids ?? [])
      .order("sort_order")
      .order("full_name");
    base = data ?? [];
  } else {
    let q = client
      .from("candidates")
      .select(cols)
      .eq("school_id", vs.school_id)
      .order("sort_order")
      .order("full_name");
    if (vs.category_id) q = q.eq("category_id", vs.category_id);
    if (vs.group_id) q = q.eq("group_id", vs.group_id);
    const { data } = await q;
    base = data ?? [];
    if (vs.voter_scope === "committee") {
      const recommended = await fetchRecommendedCandidateIds(client, vs.school_id, vs.category_id);
      base = base.filter((c) => recommended.has(c.id));
    }
  }

  const [{ data: offline }, { data: groups }] = await Promise.all([
    client
      .from("offline_group_results")
      .select("candidate_id, agree_votes, total_votes")
      .eq("school_id", vs.school_id)
      .in("candidate_id", base.map((c) => c.id)),
    client.from("subject_groups").select("id, name").eq("school_id", vs.school_id),
  ]);
  const voteMap = new Map<string, { agree: number; total: number }>(
    (offline ?? []).map((o: { candidate_id: string; agree_votes: number | null; total_votes: number | null }) => [
      o.candidate_id,
      { agree: o.agree_votes ?? 0, total: o.total_votes ?? 0 },
    ]),
  );
  const groupName = new Map<string, string>(
    (groups ?? []).map((g: { id: string; name: string }) => [g.id, g.name]),
  );
  const candidates: JudgeCandidate[] = orderJudgeCandidates(
    base.map((c) => ({
      ...c,
      agree_votes: voteMap.get(c.id)?.agree ?? null,
      total_votes: voteMap.get(c.id)?.total ?? null,
    })),
    groupName,
  );
  return { candidates, groupNames: Object.fromEntries(groupName) as Record<string, string> };
}
