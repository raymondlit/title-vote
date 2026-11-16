export type BallotChoice = { candidateId: string; choice: "recommend" | "not_recommend" | "abstain" };
export type BallotPayload = { sessionId: string; choices: BallotChoice[] };
export type DeliveryResult =
  | { status: "accepted"; ballotId: string; submittedAt: string }
  | { status: "retry" | "rejected"; message: string };
export type QueueEntry = BallotPayload & {
  userId: string; title: string; createdAt: string; attempts: number;
  nextAttemptAt: number; state: "waiting" | "sending" | "rejected"; message: string;
};
function isQueueEntry(value: unknown, userId: string): value is QueueEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<QueueEntry>;
  return e.userId === userId && typeof e.sessionId === "string" && typeof e.title === "string" &&
    typeof e.createdAt === "string" && typeof e.message === "string" &&
    typeof e.attempts === "number" && Number.isFinite(e.attempts) && e.attempts >= 0 &&
    typeof e.nextAttemptAt === "number" && Number.isFinite(e.nextAttemptAt) &&
    ["waiting", "sending", "rejected"].includes(e.state ?? "") &&
    Array.isArray(e.choices) && e.choices.every(c => c && typeof c.candidateId === "string" &&
      ["recommend", "not_recommend", "abstain"].includes(c.choice));
}
/** Equal-jitter exponential backoff: half fixed, half random, capped at 60s,
 * so dozens of judges on one Wi-Fi do not retry in lockstep. */
export function retryDelay(attempt: number, random = Math.random()) {
  const base = Math.min(60_000, 2_000 * 2 ** Math.min(Math.max(attempt, 0), 5));
  return Math.floor(base / 2 + random * (base / 2));
}
/** Spread first retry after reconnect over 0–windowMs to avoid a thundering herd. */
export function reconnectStagger(random = Math.random(), windowMs = 4_000) {
  return Math.floor(random * windowMs);
}
export function sameBallot(a: BallotChoice[], b: BallotChoice[]) {
  if (a.length !== b.length || new Set(a.map(x => x.candidateId)).size !== a.length || new Set(b.map(x => x.candidateId)).size !== b.length) return false;
  const map = new Map(b.map(x => [x.candidateId, x.choice]));
  return a.every(x => map.get(x.candidateId) === x.choice);
}

// One immutable, confirmed ballot per account/session. No credentials are persisted.
export class BallotQueue {
  entries: QueueEntry[] = [];
  private busy = false;
  private key: string;
  constructor(private userId: string, private storage: Pick<Storage, "getItem" | "setItem">, private changed: () => void) {
    this.key = `confirmed-ballots:v1:${userId}`;
    const raw = storage.getItem(this.key);
    if (raw) {
      try {
        const entries: unknown = JSON.parse(raw);
        if (!Array.isArray(entries) || !entries.every(e => isQueueEntry(e, userId))) throw new Error("暂存选票损坏");
        this.entries = entries.map(e => ({ ...e, state: e.state === "rejected" ? "rejected" : "waiting", nextAttemptAt: 0 }));
      } catch { throw new Error("无法安全读取暂存选票，请勿清理浏览器数据"); }
    }
  }
  private save(entries: QueueEntry[]) {
    this.storage.setItem(this.key, JSON.stringify(entries));
    this.entries = entries;
    this.changed();
  }
  enqueue(payload: BallotPayload, title: string) {
    if (this.entries.some(e => e.sessionId === payload.sessionId)) throw new Error("本场选票正在等待确认，请勿重复提交");
    this.save([...this.entries, { ...payload, choices: payload.choices.map(x => ({ ...x })), userId: this.userId, title, createdAt: new Date().toISOString(), attempts: 0, nextAttemptAt: 0, state: "waiting", message: "已保存在本机，等待服务器确认" }]);
  }
  dismissRejected(sessionId: string) {
    this.save(this.entries.filter(e => e.sessionId !== sessionId || e.state !== "rejected"));
  }
  /** Network came back: reschedule waiting entries with a random spread. */
  staggerOnReconnect(now = Date.now(), random = Math.random) {
    if (!this.entries.some(e => e.state === "waiting")) return;
    this.save(this.entries.map(e => e.state === "waiting" ? { ...e, nextAttemptAt: now + reconnectStagger(random()) } : e));
  }
  retryNow(sessionId: string) {
    this.save(this.entries.map(e => e.sessionId === sessionId && e.state === "waiting" ? { ...e, nextAttemptAt: 0 } : e));
  }
  async flush(online: boolean, currentUser: () => Promise<string | null>, send: (payload: BallotPayload) => Promise<DeliveryResult>, accepted: (entry: QueueEntry) => void | Promise<void>, now = Date.now()) {
    if (this.busy || !online) return;
    const entry = this.entries.find(e => e.state === "waiting" && e.nextAttemptAt <= now);
    if (!entry) return;
    this.busy = true;
    try {
      if (await currentUser() !== this.userId) return;
      this.save(this.entries.map(e => e.sessionId === entry.sessionId ? { ...e, state: "sending", message: "正在核对并提交选票" } : e));
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: DeliveryResult;
      try {
        result = await Promise.race([
          send({ sessionId: entry.sessionId, choices: entry.choices }),
          new Promise<DeliveryResult>(resolve => { timer = setTimeout(() => resolve({ status: "retry", message: "网络响应超时，稍后自动核对重试" }), 20_000); }),
        ]);
      } catch {
        result = { status: "retry", message: "网络不稳定，选票已保留，稍后自动重试" };
      } finally { if (timer) clearTimeout(timer); }
      if (result.status === "accepted") {
        await accepted(entry);
        this.save(this.entries.filter(e => e.sessionId !== entry.sessionId));
      } else {
        this.save(this.entries.map(e => e.sessionId === entry.sessionId ? {
          ...e, state: result.status === "rejected" ? "rejected" : "waiting", message: result.message,
          attempts: entry.attempts + 1, nextAttemptAt: Math.max(now, Date.now()) + retryDelay(entry.attempts),
        } : e));
      }
    } catch (error) {
      // Leave durable data intact, but allow a later connection/storage recovery
      // to retry rather than leaving the in-memory entry stuck in sending.
      this.entries = this.entries.map(e => e.sessionId === entry.sessionId ? { ...e, state: "waiting", nextAttemptAt: Date.now() + retryDelay(entry.attempts) } : e);
      this.changed();
      throw error;
    } finally { this.busy = false; }
  }
}