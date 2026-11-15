import { describe, expect, it, vi } from "vitest";
import { createSessionGuard } from "./sessionGuard";
import { BallotQueue } from "./ballotQueue";

const now = 1_000_000;
const session = (seconds: number, id = "judge-1") => ({ data: { session: { user: { id }, expires_at: seconds } }, error: null });
describe("judge session renewal", () => {
  it("does not renew a healthy token with more than five minutes remaining", async () => {
    const auth = { getSession: vi.fn(async () => session(1301)), refreshSession: vi.fn(async () => session(4600)) };
    expect(await createSessionGuard(auth, "judge-1", () => true, () => now)()).toBe("ready");
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
  it("renews at five minutes remaining and coalesces wake and submission checks", async () => {
    const auth = { getSession: vi.fn(async () => session(1300)), refreshSession: vi.fn(async () => session(4600)) };
    const guard = createSessionGuard(auth, "judge-1", () => true, () => now);
    expect(await Promise.all([guard(), guard(), guard()])).toEqual(["ready", "ready", "ready"]);
    expect(auth.refreshSession).toHaveBeenCalledOnce();
  });
  it("requests reauthentication when refresh credentials expire", async () => {
    const auth = { getSession: async () => session(900), refreshSession: async () => ({ data: { session: null }, error: { status: 400, message: "expired" } }) };
    expect(await createSessionGuard(auth, "judge-1", () => true, () => now)()).toBe("reauth");
  });
  it("treats network failures and rate limiting as retryable, not bad credentials", async () => {
    for (const status of [undefined, 429, 503]) {
      const auth = { getSession: async () => session(900), refreshSession: async () => ({ data: { session: null }, error: { status, message: "temporary" } }) };
      expect(await createSessionGuard(auth, "judge-1", () => true, () => now)()).toBe("offline");
    }
  });
  it("does not probe or send when offline", async () => {
    const auth = { getSession: vi.fn(async () => session(900)), refreshSession: vi.fn(async () => session(4600)) };
    expect(await createSessionGuard(auth, "judge-1", () => false, () => now)()).toBe("offline");
    expect(auth.getSession).not.toHaveBeenCalled();
  });
  it("blocks an account change even after successful refresh", async () => {
    const auth = { getSession: async () => session(900), refreshSession: async () => session(4600, "judge-2") };
    expect(await createSessionGuard(auth, "judge-1", () => true, () => now)()).toBe("changed");
  });
  it("keeps confirmed choices during expiry then submits unchanged after reauthentication", async () => {
    const store = new Map<string, string>();
    const queue = new BallotQueue("judge-1", { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } }, () => {});
    const choices = [{ candidateId: "candidate-1", choice: "recommend" as const }];
    queue.enqueue({ sessionId: "round-1", choices }, "第一轮");
    let restored = false;
    const auth = { getSession: async () => restored ? session(4600) : { data: { session: null }, error: null }, refreshSession: async () => session(4600) };
    const guard = createSessionGuard(auth, "judge-1", () => true, () => now);
    const send = vi.fn(async () => ({ status: "accepted" as const, ballotId: "b-1", submittedAt: "2026-11-15" }));
    const currentUser = async () => await guard() === "ready" ? "judge-1" : null;
    await queue.flush(true, currentUser, send, () => {});
    expect(send).not.toHaveBeenCalled();
    expect(queue.entries[0]?.choices).toEqual(choices);
    restored = true;
    await queue.flush(true, currentUser, send, () => {});
    expect(send).toHaveBeenCalledWith({ sessionId: "round-1", choices });
    expect(queue.entries).toHaveLength(0);
  });
});