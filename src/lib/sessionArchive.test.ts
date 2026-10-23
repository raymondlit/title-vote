import { describe, expect, it } from "vitest";
import { canArchive, canDelete, splitByArchive } from "./sessionArchive";

describe("投票场次归档与删除", () => {
  it("进行中的场次不能归档", () => {
    expect(canArchive({ status: "open", archived_at: null })).toBe(false);
  });

  it("已结束的场次可以归档", () => {
    expect(canArchive({ status: "closed", archived_at: null })).toBe(true);
  });

  it("已归档的场次不能重复归档", () => {
    expect(canArchive({ status: "closed", archived_at: "2026-10-23T00:00:00Z" })).toBe(false);
  });

  it("进行中的场次不能删除", () => {
    expect(canDelete({ status: "open" })).toBe(false);
    expect(canDelete({ status: "closed" })).toBe(true);
  });

  it("已归档场次不出现在当前列表", () => {
    const { active, archived } = splitByArchive([
      { id: "a", status: "closed", archived_at: null },
      { id: "b", status: "closed", archived_at: "2026-10-23T00:00:00Z" },
    ]);
    expect(active.map((s) => s.id)).toEqual(["a"]);
    expect(archived.map((s) => s.id)).toEqual(["b"]);
  });
});
