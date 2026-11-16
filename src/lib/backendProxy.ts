// 让浏览器的登录与数据请求全部走本站同源地址（/api/public/sb/...），
// 由本站服务端转发到后台，国内用户无需直连境外接口、无需 VPN。

export const PROXY_PREFIX = "/api/public/sb";
const PROXIED_PATHS = ["/auth/v1/", "/rest/v1/", "/storage/v1/"];

/** 若 url 指向后台的认证/数据/存储接口，返回同源代理地址；否则返回 null。 */
export function toProxyUrl(url: string, backendBase: string, origin: string): string | null {
  const base = backendBase.replace(/\/+$/, "");
  if (!base || !url.startsWith(base + "/")) return null;
  const rest = url.slice(base.length);
  if (!PROXIED_PATHS.some((p) => rest.startsWith(p))) return null;
  return origin.replace(/\/+$/, "") + PROXY_PREFIX + rest;
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
/** Only reads are retried; writes (ballots, login) have their own safe paths. */
export function isRetryableRead(method: string) {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD";
}
/** Jittered delay for read retries; honours Retry-After (seconds) up to 5s. */
export function readRetryDelay(attempt: number, retryAfter: string | null, random = Math.random()) {
  const ra = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(ra) && ra >= 0) return Math.min(5_000, ra * 1000) + Math.floor(random * 300);
  const base = 400 * 2 ** attempt;
  return Math.floor(base / 2 + random * base);
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export async function fetchWithReadRetry(doFetch: () => Promise<Response>, method: string, maxRetries = 2, wait = sleep) {
  if (!isRetryableRead(method)) return doFetch();
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await doFetch();
      if (!RETRYABLE_STATUS.has(res.status) || attempt >= maxRetries) return res;
      await wait(readRetryDelay(attempt, res.headers.get("retry-after")));
    } catch (error) {
      if ((error as Error)?.name === "AbortError" || attempt >= maxRetries) throw error;
      await wait(readRetryDelay(attempt, null));
    }
  }
}

export function installBackendProxy() {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { __backendProxyInstalled?: boolean };
  if (w.__backendProxyInstalled) return;
  const base = String(import.meta.env["VITE_SUPABASE_URL"] ?? "");
  if (!base) return;
  w.__backendProxyInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const proxied = toProxyUrl(url, base, window.location.origin);
    if (!proxied) return originalFetch(input, init);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (typeof input === "string" || input instanceof URL) return fetchWithReadRetry(() => originalFetch(proxied, init), method);
    const req = new Request(proxied, input);
    return fetchWithReadRetry(() => originalFetch(req.clone(), init), method);
  };
}
