import { describe, expect, it } from "vitest";
import { orderJudgeCandidates } from "./judgeOrder";

const c = (id: string, group: string | null, sort: number, votes: number | null = null) => ({
  id,
  full_name: id,
  group_id: group,
  sort_order: sort,
  agree_votes: votes,
  total_votes: null,
});

describe("orderJudgeCandidates", () => {
  it("单组时按管理员设定顺序", () => {
    const out = orderJudgeCandidates([c("乙", "g", 2), c("甲", "g", 3), c("丙", "g", 1)], new Map());
    expect(out.map((x) => x.id)).toEqual(["丙", "乙", "甲"]);
  });

  it("推荐票数优先，票数相同按设定顺序", () => {
    const out = orderJudgeCandidates([c("a", "g", 1, 3), c("b", "g", 2, 5), c("d", "g", 3, 3)], new Map());
    expect(out.map((x) => x.id)).toEqual(["b", "a", "d"]);
  });

  it("多组时按组名分组，未分组排最后", () => {
    const names = new Map([["x", "数学组"], ["y", "化学组"]]);
    const out = orderJudgeCandidates([c("1", null, 1), c("2", "x", 2), c("3", "y", 3)], names);
    expect(out.map((x) => x.id)).toEqual(["3", "2", "1"]);
  });
});
