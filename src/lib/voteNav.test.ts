import { describe, expect, it } from "vitest";
import { matchesFilter, nextPendingId } from "./voteNav";

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
