import type { VotingRuleRow } from "@/lib/voteRules";

/** 多轮差额遴选：场次上与轮次相关的字段 */
export type RoundFields = {
  id: string;
  title: string;
  status: string;
  round_number?: number | null;
  parent_session_id?: string | null;
  candidate_ids?: string[] | null;
  passed_candidate_ids?: string[] | null;
  max_recommend?: number | null;
};

/** 本轮是否使用固定参评名单（第 2 轮起、或首轮已冻结名单） */
export function hasFixedPool(session: { candidate_ids?: string[] | null }): boolean {
  return Array.isArray(session.candidate_ids);
}

/** 按本轮固定名单过滤参评人员；未固定时原样返回 */
export function scopeToRoundPool<T extends { id: string }>(
  candidates: T[],
  session: { candidate_ids?: string[] | null },
): T[] {
  if (!hasFixedPool(session)) return candidates;
  const allowed = new Set(session.candidate_ids ?? []);
  return candidates.filter((c) => allowed.has(c.id));
}

/**
 * 本轮实际生效规则：场次设置了本轮推荐名额时覆盖规则中的名额，参评人数取本轮名单人数。
 * 场次未设置名额时沿用投票规则。
 */
export function effectiveRoundRule<T extends VotingRuleRow>(
  rule: T | null,
  session: { max_recommend?: number | null },
  poolSize: number,
): VotingRuleRow | null {
  const quota = session.max_recommend;
  if (quota === null || quota === undefined) return rule;
  return {
    category_id: rule?.category_id ?? null,
    group_id: rule?.group_id ?? null,
    allow_abstain: rule?.allow_abstain ?? false,
    require_all: rule?.require_all ?? true,
    total_count: poolSize,
    max_recommend: quota,
  };
}

/** 下一轮参评名单：本轮名单剔除已通过者，保持原顺序 */
export function remainingAfterRound(poolIds: string[], passedIds: string[]): string[] {
  const passed = new Set(passedIds);
  return poolIds.filter((id) => !passed.has(id));
}

/** 默认通过名单：按推荐票数从高到低取前 n 名（票数为 0 者不计入） */
export function defaultPassedIds(
  rows: { id: string; recommend: number; name: string }[],
  n: number,
): string[] {
  if (n <= 0) return [];
  return [...rows]
    .filter((r) => r.recommend > 0)
    .sort((a, b) => b.recommend - a.recommend || a.name.localeCompare(b.name, "zh-Hans-CN"))
    .slice(0, n)
    .map((r) => r.id);
}

/** 下一轮场次名称：去掉原有「（第N轮）」后缀再追加新的轮次 */
export function nextRoundTitle(title: string, nextRound: number): string {
  const base = title.replace(/\s*[（(]第\s*\d+\s*轮[）)]\s*$/, "").trim();
  return `${base}（第${nextRound}轮）`;
}

/** 某场次所在的完整轮次链：从首轮到最后一轮 */
export function roundChain<T extends RoundFields>(sessions: T[], sessionId: string): T[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  let root = byId.get(sessionId);
  if (!root) return [];
  const seen = new Set<string>([root.id]);
  while (root.parent_session_id && byId.has(root.parent_session_id)) {
    const parent: T = byId.get(root.parent_session_id)!;
    if (seen.has(parent.id)) break;
    seen.add(parent.id);
    root = parent;
  }
  const chain: T[] = [root];
  const visited = new Set<string>([root.id]);
  let cursor: T = root;
  for (;;) {
    const child = sessions.find(
      (s) => s.parent_session_id === cursor.id && !visited.has(s.id),
    );
    if (!child) break;
    visited.add(child.id);
    chain.push(child);
    cursor = child;
  }
  return chain;
}

/** 分页读取全部表决明细，避免单次查询 1000 行上限导致票数缺失 */
export async function fetchAllBallotItems(
  client: any,
  ballotIds: string[],
): Promise<{ ballot_id: string; candidate_id: string; choice: string }[]> {
  if (ballotIds.length === 0) return [];
  const out: { ballot_id: string; candidate_id: string; choice: string }[] = [];
  const CHUNK = 50;
  const PAGE = 1000;
  for (let i = 0; i < ballotIds.length; i += CHUNK) {
    const ids = ballotIds.slice(i, i + CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from("ballot_items")
        .select("id, ballot_id, candidate_id, choice")
        .in("ballot_id", ids)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as { ballot_id: string; candidate_id: string; choice: string }[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  return out;
}
