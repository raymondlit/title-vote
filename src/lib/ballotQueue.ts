export type BallotChoice = { candidateId: string; choice: "recommend" | "not_recommend" | "abstain" };
export type BallotPayload = { sessionId: string; choices: BallotChoice[] };
export type DeliveryResult =
  | { status: "accepted"; ballotId: string; submittedAt: string }
  | { status: "retry" | "rejected"; message: string };
export type QueueEntry = BallotPayload & {
  userId: string; title: string; createdAt: string; attempts: number;
  nextAttemptAt: number; state: "waiting" | "sending" | "rejected"; message: string;
};
export function retryDelay(attempt: number, random = Math.random()) {
  return Math.min(60_000, 2_000 * 2 ** Math.min(attempt, 5)) + Math.floor(random * 1000);
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
        const entries = JSON.parse(raw) as QueueEntry[];
        if (Array.isArray(entries)) this.entries = entries.filter(e => e.userId === userId && typeof e.sessionId === "string" && Array.isArray(e.choices)).map(e => ({ ...e, state: e.state === "rejected" ? "rejected" : "waiting", nextAttemptAt: 0 }));
      } catch { /* A malformed queue must not trigger submissions. */ }
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
    } finally { this.busy = false; }
  }
}