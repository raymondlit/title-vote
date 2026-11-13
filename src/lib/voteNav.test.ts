import { describe, expect, it } from "vitest";
import { adjacentCandidateId, matchesFilter, nextPendingId, voteKeyboardAction } from "./voteNav";

describe("keyboard voting", () => {
  it("1 recommends", () => expect(voteKeyboardAction("1")).toBe("recommend"));
  it("2 rejects", () => expect(voteKeyboardAction("2")).toBe("not_recommend"));
  it("down or J moves forward", () => {
    expect(voteKeyboardAction("ArrowDown")).toBe("next");
    expect(voteKeyboardAction("J")).toBe("next");
  });
  it("up or K moves backward", () => {
    expect(voteKeyboardAction("ArrowUp")).toBe("previous");
    expect(voteKeyboardAction("K")).toBe("previous");
  });
  it("space locates pending", () => expect(voteKeyboardAction(" ")).toBe("pending"));
  it("does not wrap past visible boundaries", () => {
    expect(adjacentCandidateId(["a", "c"], "a", -1)).toBe("a");
    expect(adjacentCandidateId(["a", "c"], "a", 1)).toBe("c");
    expect(adjacentCandidateId(["a", "c"], "c", 1)).toBe("c");
    expect(adjacentCandidateId([], null, 1)).toBeNull();
  });
});

describe("nextPendingId", () => {
  const ids = ["a", "b", "c", "d"];

  it("从头开始找到第一个未表态人员", () => {
    expect(nextPendingId(ids, { a: "recommend" }, null)).toBe("b");
  });

  it("从当前定位人员之后继续查找", () => {
    expect(nextPendingId(ids, { a: "recommend" }, "b")).toBe("c");
  });

  it("到末尾后回到开头循环", () => {
    expect(nextPendingId(ids, { b: "recommend", c: "not_recommend" }, "d")).toBe("a");
  });

  it("全部已表态时返回 null", () => {
    expect(
      nextPendingId(ids, { a: "recommend", b: "recommend", c: "not_recommend", d: "recommend" }, "a"),
    ).toBeNull();
  });
});

describe("matchesFilter", () => {
  it("未表态筛选只保留没有选择的人员", () => {
    expect(matchesFilter(undefined, "pending")).toBe(true);
    expect(matchesFilter("recommend", "pending")).toBe(false);
  });

  it("已推荐/不推荐筛选按选择匹配", () => {
    expect(matchesFilter("recommend", "recommend")).toBe(true);
    expect(matchesFilter("not_recommend", "recommend")).toBe(false);
    expect(matchesFilter("not_recommend", "not_recommend")).toBe(true);
  });
});
