import { describe, expect, it, vi } from "vitest";
import { BallotQueue, retryDelay, sameBallot, type BallotPayload } from "./ballotQueue";
const payload: BallotPayload = { sessionId: "round-1", choices: [{ candidateId: "person-1", choice: "recommend" }] };
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
const accepted = async () => ({ status: "accepted" as const, ballotId: "ballot-1", submittedAt: "2026-11-13" });
describe("confirmed offline ballot delivery", () => {
  it("persists immutable confirmed choices across reload without sending offline", async () => {
    const store = storage();
    const queue = new BallotQueue("judge-1", store, () => {});
    const input = structuredClone(payload);
    queue.enqueue(input, "第一轮");
    const first = input.choices[0];
    if (!first) throw new Error("Missing fixture");
    first.choice = "not_recommend";
    const send = vi.fn(accepted);
    const restored = new BallotQueue("judge-1", store, () => {});
    await restored.flush(false, async () => "judge-1", send, () => {});
    expect(send).not.toHaveBeenCalled();
    expect(restored.entries[0]?.choices[0]?.choice).toBe("recommend");
  });
  it("isolates accounts and never sends under another user's session", async () => {
    const store = storage();
    const queue = new BallotQueue("judge-1", store, () => {});
    queue.enqueue(payload, "第一轮");
    expect(new BallotQueue("judge-2", store, () => {}).entries).toHaveLength(0);
    const send = vi.fn(accepted);
    await queue.flush(true, async () => "judge-2", send, () => {});
    expect(send).not.toHaveBeenCalled();
    expect(queue.entries).toHaveLength(1);
  });
  it("retains a lost response and delivers on recovery without clearing early", async () => {
    const queue = new BallotQueue("judge-1", storage(), () => {});
    queue.enqueue(payload, "第一轮");
    await queue.flush(true, async () => "judge-1", async () => { throw new TypeError("Failed to fetch"); }, () => {});
    expect(queue.entries[0]?.state).toBe("waiting");
    expect(queue.entries[0]?.attempts).toBe(1);
    const success = vi.fn();
    await queue.flush(true, async () => "judge-1", accepted, success, Date.now() + 100_000);
    expect(success).toHaveBeenCalledOnce();
    expect(queue.entries).toHaveLength(0);
  });
  it("never automatically retries a closed session or invalid ballot rejection", async () => {
    const queue = new BallotQueue("judge-1", storage(), () => {});
    queue.enqueue(payload, "第一轮");
    await queue.flush(true, async () => "judge-1", async () => ({ status: "rejected", message: "该场投票已结束" }), () => {});
    const send = vi.fn(accepted);
    await queue.flush(true, async () => "judge-1", send, () => {}, Date.now() + 100_000);
    expect(send).not.toHaveBeenCalled();
    expect(queue.entries[0]?.state).toBe("rejected");
    queue.dismissRejected("round-1");
    expect(queue.entries).toHaveLength(0);
  });
  it("rejects a second confirmed payload for the same round", () => {
    const queue = new BallotQueue("judge-1", storage(), () => {});
    queue.enqueue(payload, "第一轮");
    expect(() => queue.enqueue(payload, "第一轮")).toThrow();
    expect(queue.entries).toHaveLength(1);
  });
  it("fails closed when durable storage is unavailable", () => {
    const queue = new BallotQueue("judge-1", { getItem: () => null, setItem: () => { throw new Error("quota"); } }, () => {});
    expect(() => queue.enqueue(payload, "第一轮")).toThrow("quota");
    expect(queue.entries).toHaveLength(0);
  });
  it("never overwrites corrupted confirmed votes with an empty queue", () => {
    const store = storage();
    store.setItem("confirmed-ballots:v1:judge-1", '[{"sessionId":"round-1","choices":null}]');
    expect(() => new BallotQueue("judge-1", store, () => {})).toThrow("无法安全读取");
    expect(store.getItem("confirmed-ballots:v1:judge-1")).toContain('"choices":null');
  });
  it("backs off WiFi errors instead of flooding the server", async () => {
    expect(retryDelay(0, 0)).toBe(1000);
    expect(retryDelay(0, 0.999)).toBeLessThan(2000);
    expect(retryDelay(1, 0)).toBe(2000);
    expect(retryDelay(20, 0)).toBe(30000);
    expect(retryDelay(20, 0.9999)).toBeLessThanOrEqual(60000);
    const queue = new BallotQueue("judge-1", storage(), () => {});
    queue.enqueue(payload, "第一轮");
    const send = vi.fn(async () => ({ status: "retry" as const, message: "弱网" }));
    await queue.flush(true, async () => "judge-1", send, () => {});
    await queue.flush(true, async () => "judge-1", send, () => {});
    expect(send).toHaveBeenCalledOnce();
  });
  it("accepts only identical stored ballots regardless of order", () => {
    const first = { candidateId: "a", choice: "recommend" as const };
    const second = { candidateId: "b", choice: "not_recommend" as const };
    const a = [first, second];
    expect(sameBallot(a, [...a].reverse())).toBe(true);
    expect(sameBallot(a, [first])).toBe(false);
    expect(sameBallot(a, [first, { ...second, choice: "recommend" }])).toBe(false);
    expect(sameBallot([first, first], a)).toBe(false);
    expect(sameBallot(a, [first, first])).toBe(false);
  });
  it("serializes overlapping retries in a single page", async () => {
    const queue = new BallotQueue("judge-1", storage(), () => {});
    queue.enqueue(payload, "第一轮");
    const send = vi.fn(accepted);
    await Promise.all([queue.flush(true, async () => "judge-1", send, () => {}), queue.flush(true, async () => "judge-1", send, () => {})]);
    expect(send).toHaveBeenCalledOnce();
  });
  it("times out a stalled response without losing the confirmed ballot", async () => {
    vi.useFakeTimers();
    try {
      const queue = new BallotQueue("judge-1", storage(), () => {});
      queue.enqueue(payload, "第一轮");
      const task = queue.flush(true, async () => "judge-1", () => new Promise(() => {}), () => {});
      await vi.advanceTimersByTimeAsync(20_000);
      await task;
      expect(queue.entries[0]?.state).toBe("waiting");
      expect(queue.entries[0]?.choices).toEqual(payload.choices);
    } finally { vi.useRealTimers(); }
  });
});