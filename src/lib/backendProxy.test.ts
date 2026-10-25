import { describe, expect, it } from "vitest";
import { toProxyUrl } from "./backendProxy";

const BASE = "https://abc.supabase.co";
const ORIGIN = "https://titlevote.com";

describe("toProxyUrl", () => {
  it("routes login requests through the site's own domain", () => {
    expect(toProxyUrl(`${BASE}/auth/v1/token?grant_type=password`, BASE, ORIGIN)).toBe(
      "https://titlevote.com/api/public/sb/auth/v1/token?grant_type=password",
    );
  });

  it("routes data queries through the site's own domain", () => {
    expect(toProxyUrl(`${BASE}/rest/v1/profiles?select=*`, BASE, ORIGIN)).toBe(
      "https://titlevote.com/api/public/sb/rest/v1/profiles?select=*",
    );
  });

  it("leaves unrelated URLs untouched", () => {
    expect(toProxyUrl("https://example.com/rest/v1/x", BASE, ORIGIN)).toBeNull();
    expect(toProxyUrl(`${BASE}/functions/v1/x`, BASE, ORIGIN)).toBeNull();
  });
});
