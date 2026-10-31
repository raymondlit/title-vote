import { describe, expect, it } from "vitest";
import {
  BALLOT_WIDTH,
  ballotColumns,
  buildBallotDocs,
  paginateBallot,
  resolveInstructions,
  ROW_HEIGHTS,
  type BallotCandidate,
} from "@/lib/paperBallot";

const cand = (id: string, group_id: string | null): BallotCandidate => ({
  id,
  full_name: `人员${id}`,
  unit: null,
  current_title: null,
  group_id,
  agree_votes: null,
  total_votes: null,
});

const names: Record<string, string> = { g1: "工科一组", g2: "理科组" };
const groupName = (id: string | null) => (id ? names[id]! : "未分组");
const list = [cand("a", "g1"), cand("b", "g1"), cand("c", "g2"), cand("d", "g2"), cand("e", "g2")];

describe("buildBallotDocs", () => {
  it("指定学科组独立票只包含该组人员，序号从 1 开始", () => {
    const docs = buildBallotDocs({ candidates: list, scope: "group", groupId: "g2", groupName, quotaFor: () => 2 });
    expect(docs).toHaveLength(1);
    expect(docs[0]!.groupLabel).toBe("理科组");
    expect(docs[0]!.lines.map((l) => (l.kind === "row" ? `${l.no}${l.candidate.id}` : "")))
      .toEqual(["1c", "2d", "3e"]);
  });

  it("全类别一张票按学科组插入分段标题，序号连续", () => {
    const docs = buildBallotDocs({ candidates: list, scope: "all", groupId: null, groupName, quotaFor: () => 3 });
    expect(docs).toHaveLength(1);
    const labels = docs[0]!.lines.map((l) => (l.kind === "group" ? l.label : String(l.no)));
    expect(labels).toEqual(["工科一组（2 人）", "1", "2", "理科组（3 人）", "3", "4", "5"]);
    expect(docs[0]!.quota).toBe(3);
  });

  it("按学科组批量：每组一份，名额按各组规则", () => {
    const docs = buildBallotDocs({
      candidates: list,
      scope: "batch",
      groupId: null,
      groupName,
      quotaFor: (g) => (g === "g1" ? 1 : 2),
    });
    expect(docs.map((d) => [d.groupLabel, d.count, d.quota])).toEqual([
      ["工科一组", 2, 1],
      ["理科组", 3, 2],
    ]);
  });
});

describe("paginateBallot", () => {
  const many = (n: number, g: string | null = "g1") =>
    Array.from({ length: n }, (_, i) => cand(String(i), g));

  it("学科组跨页时新页顶部补「组名（续）」", () => {
    const docs = buildBallotDocs({
      candidates: [...many(3, "g2"), ...many(40, "g1")],
      scope: "all",
      groupId: null,
      groupName,
      quotaFor: () => null,
    });
    const pages = paginateBallot(docs[0]!.lines, { rowH: ROW_HEIGHTS.normal, signEveryPage: false, grouped: true });
    expect(pages.length).toBeGreaterThan(1);
    const top = pages[1]![0]!;
    expect(top.kind === "group" && top.cont && top.label).toBe("工科一组（续）");
  });

  it("每人只出现一次，不丢人", () => {
    const docs = buildBallotDocs({ candidates: many(57), scope: "group", groupId: "g1", groupName, quotaFor: () => null });
    const pages = paginateBallot(docs[0]!.lines, { rowH: ROW_HEIGHTS.compact, signEveryPage: true, grouped: false });
    expect(pages.flat().filter((l) => l.kind === "row")).toHaveLength(57);
  });

  it("签名栏放不下时把最后一人移到新页，签名栏不单独成页", () => {
    // 正常行高首页可放 21 行，含签名栏只能放 20 行
    const docs = buildBallotDocs({ candidates: many(21), scope: "group", groupId: "g1", groupName, quotaFor: () => null });
    const pages = paginateBallot(docs[0]!.lines, { rowH: ROW_HEIGHTS.normal, signEveryPage: false, grouped: false });
    expect(pages.map((p) => p.length)).toEqual([20, 1]);
  });
});

describe("ballotColumns", () => {
  it("栏目总宽等于版心宽度", () => {
    const w = (cols: ReturnType<typeof ballotColumns>) => cols.reduce((s, c) => s + c.w, 0);
    expect(w(ballotColumns(["unit", "title", "group", "votes"], "agree_reject_abstain"))).toBeCloseTo(BALLOT_WIDTH);
    expect(w(ballotColumns([], "agree"))).toBeCloseTo(BALLOT_WIDTH);
  });

  it("表决栏按所选格式生成", () => {
    const marks = (m: Parameters<typeof ballotColumns>[1]) =>
      ballotColumns([], m).filter((c) => c.mark).map((c) => c.label);
    expect(marks("agree")).toEqual(["推荐"]);
    expect(marks("agree_reject")).toEqual(["推荐", "不推荐"]);
    expect(marks("agree_reject_abstain")).toEqual(["推荐", "不推荐", "弃权"]);
  });
});

describe("resolveInstructions", () => {
  it("有名额时替换占位符", () => {
    expect(resolveInstructions("每人一项。推荐不超过 {名额} 人。", 3)).toBe("每人一项。推荐不超过 3 人。");
  });
  it("无名额时去掉含名额的句子", () => {
    expect(resolveInstructions("每人一项。推荐不超过 {名额} 人。请签名。", null)).toBe("每人一项。请签名。");
  });
});
