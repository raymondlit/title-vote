import { describe, expect, it } from "vitest";
import { relayResponseHasBody } from "./relayResponse";

describe("same-origin relay response bodies", () => {
  for (const status of [204, 205, 304]) {
    it(`preserves bodyless status ${status} without throwing`, () => {
      const body = relayResponseHasBody("PATCH", status) ? new ArrayBuffer(0) : null;
      const response = new Response(body, { status });
      expect(response.status).toBe(status);
      expect(response.body).toBeNull();
    });
  }
  it("keeps HEAD bodyless even on 200", () => {
    expect(relayResponseHasBody("head", 200)).toBe(false);
  });
  it("preserves ordinary data and error bodies", () => {
    expect(relayResponseHasBody("GET", 200)).toBe(true);
    expect(relayResponseHasBody("POST", 422)).toBe(true);
  });
});