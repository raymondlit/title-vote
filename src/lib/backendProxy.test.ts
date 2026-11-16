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

import { fetchWithReadRetry, readRetryDelay, isRetryableRead } from "./backendProxy";
describe("read retry", () => {
  it("never retries writes", async () => {
    let n = 0;
    const r = await fetchWithReadRetry(async () => { n++; return new Response("", { status: 503 }); }, "POST", 2, async () => {});
    expect(r.status).toBe(503); expect(n).toBe(1); expect(isRetryableRead("post")).toBe(false);
  });
  it("retries GET on 503 up to 2 times", async () => {
    let n = 0;
    const r = await fetchWithReadRetry(async () => { n++; return new Response("", { status: n < 3 ? 503 : 200 }); }, "GET", 2, async () => {});
    expect(r.status).toBe(200); expect(n).toBe(3);
  });
  it("does not retry 4xx other than 429", async () => {
    let n = 0;
    await fetchWithReadRetry(async () => { n++; return new Response("", { status: 401 }); }, "GET", 2, async () => {});
    expect(n).toBe(1);
  });
  it("honours Retry-After capped at 5s", () => {
    expect(readRetryDelay(0, "2", 0)).toBe(2000);
    expect(readRetryDelay(0, "60", 0)).toBe(5000);
  });
});
