import { describe, expect, it } from "vitest";
import { validRuleCounts } from "./ruleInput";

describe("rule person counts", () => {
  it("accepts 5 candidates and at most 2 recommendations", () => {
    expect(validRuleCounts("5", "2")).toBe(true);
  });
  it("rejects a fractional recommendation count", () => {
    expect(validRuleCounts("5", "1.5")).toBe(false);
  });
  it("rejects a fractional candidate count", () => {
    expect(validRuleCounts("5.5", "2")).toBe(false);
  });
  it("rejects zero or negative counts", () => {
    expect(validRuleCounts("0", "1")).toBe(false);
    expect(validRuleCounts("5", "0")).toBe(false);
    expect(validRuleCounts("5", "-1")).toBe(false);
  });
  it("rejects recommendations beyond the total", () => {
    expect(validRuleCounts("5", "6")).toBe(false);
  });
  it("rejects blank and non-integer notation", () => {
    expect(validRuleCounts("", "2")).toBe(false);
    expect(validRuleCounts("5", "")).toBe(false);
    expect(validRuleCounts("5", "2e0")).toBe(false);
  });
  it("rejects counts outside the database integer range", () => {
    expect(validRuleCounts("2147483648", "2")).toBe(false);
  });
});