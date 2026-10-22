import { describe, expect, it } from "vitest";
import {
  defaultPassedIds,
  effectiveRoundRule,
  nextRoundTitle,
  remainingAfterRound,
  roundChain,
  scopeToRoundPool,
} from "./rounds";

const ids = (n: number, prefix = "c") => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

describe("多轮差额遴选", () => {
  it("50 人首轮选出 10 人，下一轮剩余 40 人", () => {
    const pool = ids(50);
    const passed = pool.slice(0, 10);
    expect(remainingAfterRound(pool, passed)).toHaveLength(40);
  });

  it("40 人第二轮再选出 5 人，第三轮剩余 35 人", () => {
    const pool = ids(40);
    const passed = pool.slice(0, 5);
    const next = remainingAfterRound(pool, passed);
    expect(next).toHaveLength(35);
    expect(next).not.toContain("c1");
  });

  it("固定名单的场次只展示本轮名单内人员", () => {
    const cands = ids(5).map((id) => ({ id }));
    expect(scopeToRoundPool(cands, { candidate_ids: ["c2", "c4"] }).map((c) => c.id)).toEqual([
      "c2",
      "c4",
    ]);
    expect(scopeToRoundPool(cands, { candidate_ids: null })).toHaveLength(5);
  });

  it("本轮推荐名额覆盖投票规则中的名额", () => {
    const rule = {
      category_id: "cat",
      group_id: null,
      total_count: 50,
      max_recommend: 10,
      allow_abstain: false,
      require_all: true,
    };
    const r = effectiveRoundRule(rule, { max_recommend: 5 }, 40);
    expect(r?.max_recommend).toBe(5);
    expect(r?.total_count).toBe(40);
    expect(effectiveRoundRule(rule, { max_recommend: null }, 40)?.max_recommend).toBe(10);
  });

  it("默认通过名单按推荐票数取前 N 名", () => {
    const rows = [
      { id: "a", name: "甲", recommend: 3 },
      { id: "b", name: "乙", recommend: 9 },
      { id: "c", name: "丙", recommend: 0 },
      { id: "d", name: "丁", recommend: 5 },
    ];
    expect(defaultPassedIds(rows, 2)).toEqual(["b", "d"]);
    expect(defaultPassedIds(rows, 10)).toEqual(["b", "d", "a"]);
  });

  it("下一轮名称替换轮次后缀", () => {
    expect(nextRoundTitle("教授组评审", 2)).toBe("教授组评审（第2轮）");
    expect(nextRoundTitle("教授组评审（第2轮）", 3)).toBe("教授组评审（第3轮）");
  });

  it("轮次链从首轮排到最后一轮", () => {
    const s = (id: string, parent: string | null) => ({
      id,
      title: id,
      status: "closed",
      parent_session_id: parent,
    });
    const list = [s("r3", "r2"), s("r1", null), s("r2", "r1"), s("other", null)];
    expect(roundChain(list, "r2").map((x) => x.id)).toEqual(["r1", "r2", "r3"]);
  });
});
