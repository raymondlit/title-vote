import { createFileRoute } from "@tanstack/react-router";

// 同源转发：浏览器 → 本站 /api/public/sb/* → 后台。
// 不附加任何额外权限，原样转发调用方自己的 apikey / 登录令牌，
// 数据访问仍由数据库行级权限控制。
const PREFIX = "/api/public/sb";
const ALLOWED = ["/auth/v1/", "/rest/v1/", "/storage/v1/"];
const DROP_REQUEST = new Set([
  "host",
  "cookie",
  "connection",
  "content-length",
  "accept-encoding",
  "origin",
  "referer",
  "true-client-ip",
  "cdn-loop",
  "x-real-ip",
]);
const DROP_RESPONSE = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "set-cookie",
]);

async function forward(request: Request): Promise<Response> {
  const base = (process.env["SUPABASE_URL"] ?? "").replace(/\/+$/, "");
  if (!base) return new Response("Backend not configured", { status: 500 });

  const url = new URL(request.url);
  const rest = url.pathname.slice(PREFIX.length);
  if (!ALLOWED.some((p) => rest.startsWith(p))) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (DROP_REQUEST.has(k) || k.startsWith("cf-") || k.startsWith("x-forwarded-")) return;
    headers.set(key, value);
  });
  const clientIp =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (clientIp) headers.set("sb-forwarded-for", clientIp);

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? null : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(base + rest + url.search, {
      method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (error) {
    console.error("[backend-proxy] upstream failed", error);
    return new Response(JSON.stringify({ message: "backend unreachable" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key.toLowerCase())) out.set(key, value);
  });
  if (!out.has("cache-control")) out.set("cache-control", "no-store");

  return new Response(method === "HEAD" ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

export const Route = createFileRoute("/api/public/sb/$")({
  server: {
    handlers: {
      GET: ({ request }) => forward(request),
      HEAD: ({ request }) => forward(request),
      POST: ({ request }) => forward(request),
      PUT: ({ request }) => forward(request),
      PATCH: ({ request }) => forward(request),
      DELETE: ({ request }) => forward(request),
    },
  },
});
