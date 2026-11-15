type AuthSession = { user: { id: string }; expires_at?: number };
type AuthResult = { data: { session: AuthSession | null }; error?: { status?: number; message: string } | null };
type AuthClient = { getSession: () => Promise<AuthResult>; refreshSession: () => Promise<AuthResult> };
export type SessionHealth = "ready" | "offline" | "reauth" | "changed";
export const RENEW_BEFORE_MS = 5 * 60_000;

// A single flight per mounted judge workspace, never a server-side session cache.
export function createSessionGuard(auth: AuthClient, expectedUserId: string, online = () => navigator.onLine, now = Date.now) {
  let flight: Promise<SessionHealth> | null = null;
  async function check(): Promise<SessionHealth> {
    if (!online()) return "offline";
    try {
      const initial = await auth.getSession();
      if (initial.error) return initial.error.status && initial.error.status < 500 ? "reauth" : "offline";
      const session = initial.data.session;
      if (!session) return "reauth";
      if (session.user.id !== expectedUserId) return "changed";
      if ((session.expires_at ?? 0) * 1000 - now() > RENEW_BEFORE_MS) return "ready";
      const refreshed = await auth.refreshSession();
      if (refreshed.error) return refreshed.error.status && refreshed.error.status >= 400 && refreshed.error.status < 500 && refreshed.error.status !== 429 ? "reauth" : "offline";
      if (!refreshed.data.session) return "reauth";
      return refreshed.data.session.user.id === expectedUserId ? "ready" : "changed";
    } catch { return "offline"; }
  }
  return () => {
    if (!flight) flight = check().finally(() => { flight = null; });
    return flight;
  };
}