import { describe, expect, it } from "vitest";
import { saveVoteDraft } from "./voteDraft";

describe("draft durability", () => {
  it("reports saved only after persisting the exact choices", () => {
    const values = new Map<string, string>();
    const result = saveVoteDraft({ setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); } }, "draft:account", { a: "recommend", b: "not_recommend" });
    expect(result.status).toBe("saved");
    expect(JSON.parse(values.get("draft:account") ?? "null").choices).toEqual({ a: "recommend", b: "not_recommend" });
  });
  it("reports failure without changing current choices when storage is full", () => {
    const choices = { a: "recommend" as const };
    expect(saveVoteDraft({ setItem: () => { throw new Error("quota"); }, removeItem: () => {} }, "draft:account", choices)).toEqual({ status: "error" });
    expect(choices).toEqual({ a: "recommend" });
  });
  it("clears an empty draft without claiming it was saved", () => {
    let removed = "";
    expect(saveVoteDraft({ setItem: () => { throw new Error("unexpected write"); }, removeItem: k => { removed = k; } }, "draft:account", {})).toEqual({ status: "empty" });
    expect(removed).toBe("draft:account");
  });
});