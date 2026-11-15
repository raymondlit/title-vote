import { describe, expect, it } from "vitest";
import { applySessionCounts, sessionSummarySchema } from "./sessionSummary";
const id = "00000000-0000-4000-8000-000000000001";
describe("session aggregate results", () => {
  it("preserves totals above the 1000-row API limit without details", () => {
    const summary = sessionSummarySchema.parse({ counts: [{ candidate_id: id, recommend: 1200, not_recommend: 500, abstain: 300 }], ballots: [] });
    expect(applySessionCounts([{ id, name: "甲" }], summary)[0]).toEqual({ id, name: "甲", recommend: 1200, not_recommend: 500, abstain: 300 });
  });
  it("keeps fixed pool scope and zero-vote candidates", () => {
    const summary = sessionSummarySchema.parse({ counts: [{ candidate_id: id, recommend: 10, not_recommend: 0, abstain: 0 }], ballots: [] });
    expect(applySessionCounts([{ id: "outside" }], summary)).toEqual([{ id: "outside", recommend: 0, not_recommend: 0, abstain: 0 }]);
  });
  it("rejects malformed totals rather than showing a false zero", () => {
    expect(() => sessionSummarySchema.parse({ counts: [{ candidate_id: id, recommend: -1 }], ballots: [] })).toThrow();
  });
});