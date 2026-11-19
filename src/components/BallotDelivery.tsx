import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { submitBallot } from "@/lib/vote.functions";
import { BallotQueue, type BallotPayload, type QueueEntry } from "@/lib/ballotQueue";
import { Button } from "@/components/ui/button";
import { createSessionGuard, type SessionHealth } from "@/lib/sessionGuard";
import { JudgeReauthDialog } from "@/components/JudgeReauthDialog";

type Delivery = { online: boolean; entries: QueueEntry[]; enqueue: (payload: BallotPayload, title: string) => void };
const Context = createContext<Delivery>({ online: true, entries: [], enqueue: () => { throw new Error("选票暂存尚未就绪，请稍后再试"); } });
export function useBallotDelivery() { return useContext(Context); }

export function BallotDelivery({ userId, email, children }: { userId: string | undefined; email?: string | null | undefined; children: ReactNode }) {
  const submit = useServerFn(submitBallot);
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [online, setOnline] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [health, setHealth] = useState<SessionHealth>("ready");
  const [reauthOpen, setReauthOpen] = useState(false);
  const wake = useRef<() => void>(() => {});
  const queue = useRef<BallotQueue | null>(null);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    setEntries([]);
    setHealth("ready"); setReauthOpen(false);
    if (!userId) return;
    let active = true;
    const ensureSession = createSessionGuard(supabase.auth, userId);
    let lastCheck = 0;
    let authPrompted = false;
    const check = async () => {
      const next = await ensureSession();
      if (active) {
        setHealth(next);
        if (next === "reauth" && !authPrompted) { authPrompted = true; setReauthOpen(true); }
        if (next === "ready") authPrompted = false;
      }
      return next;
    };
    let engine: BallotQueue;
    try {
      engine = new BallotQueue(userId, localStorage, () => { if (active) setEntries([...engine.entries]); });
      queue.current = engine;
      setEntries([...engine.entries]);
      setStorageError(false);
    } catch { setStorageError(true); return; }
    const pump = () => {
      setOnline(navigator.onLine);
      void engine.flush(navigator.onLine, async () => {
        if (!active) return null;
        return await check() === "ready" && active ? userId : null;
      }, payload => submitRef.current({ data: { ...payload, expectedUserId: userId } }), async entry => {
        try { localStorage.removeItem(`vote-draft:${entry.sessionId}:${userId}`); } catch { /* Optional cleanup. */ }
        if (!active) return;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["vote-session", entry.sessionId] }),
          queryClient.invalidateQueries({ queryKey: ["judge-sessions"] }),
        ]);
        toast.success(`${entry.title}：服务器已确认提交`);
      }).catch(() => { if (active) setStorageError(true); });
    };
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      lastCheck = Date.now();
      void check().then(() => { if (active) pump(); });
    };
    wake.current = resume;
    const heartbeat = () => {
      if (Date.now() - lastCheck >= 60_000) resume();
    };
    pump();
    resume();
    const interval = window.setInterval(pump, 1000);
    const heartbeatInterval = window.setInterval(heartbeat, 30_000);
    document.addEventListener("visibilitychange", resume);
    const reconnect = () => {
      try { engine.staggerOnReconnect(); } catch { setStorageError(true); }
      pump();
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", pump);
    window.addEventListener("focus", resume);
    const warn = (event: BeforeUnloadEvent) => {
      if (engine.entries.length) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      active = false;
      queue.current = null;
      window.clearInterval(interval);
      window.clearInterval(heartbeatInterval);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", pump);
      window.removeEventListener("focus", resume);
      window.removeEventListener("beforeunload", warn);
    };
  }, [userId, queryClient]);
  return <Context.Provider value={{ online, entries, enqueue: (payload, title) => {
    const engine = queue.current;
    if (!engine || storageError) throw new Error("无法安全保存选票，请允许浏览器存储后再提交；当前选择未清除");
    engine.enqueue(payload, title);
    wake.current();
  } }}>
    {(health === "reauth" || health === "changed") && <div role="status" className="mb-4 flex flex-wrap items-center gap-3 border-y border-border bg-muted px-4 py-3 text-sm">
      <span>{health === "changed" ? "登录账号已变化；原账号选票未发送。" : "登录需要重新确认；当前选择与暂存选票仍保留。"}</span>
      <Button variant="outline" size="sm" onClick={() => setReauthOpen(true)}>确认原账号登录</Button>
    </div>}
    {userId && <JudgeReauthDialog open={reauthOpen} onOpenChange={setReauthOpen} userId={userId} email={email} onReady={() => wake.current()} />}
    {(!online || entries.length > 0 || storageError) && <section aria-label="选票提交状态" aria-live="polite" className="mb-6 border-y border-border bg-muted px-4 py-3 text-sm">
      {!online && <p className="flex items-center gap-2"><WifiOff className="size-4" />网络已断开；已确认的选票等待联网提交，尚未计入结果。</p>}
      {storageError && <p className="text-destructive">无法安全暂存选票，请检查浏览器存储；不要关闭页面或清理数据。</p>}
      {entries.map(entry => <div key={entry.sessionId} className="flex flex-wrap items-center gap-3 py-2">
        {entry.state === "sending" && <Loader2 className="size-4 animate-spin" />}
        <span className="font-medium">{entry.title}</span>
        <span className={entry.state === "rejected" ? "text-destructive" : "text-muted-foreground"}>{entry.message}。{entry.state !== "rejected" && "请勿清理浏览器数据；暂存不等于提交成功。"}</span>
        {entry.state === "waiting" && <Button variant="outline" size="sm" disabled={!online} onClick={() => queue.current?.retryNow(entry.sessionId)}>立即重试</Button>}
        {entry.state === "rejected" && <Button variant="outline" size="sm" onClick={() => {
          try {
            localStorage.setItem(`vote-draft:${entry.sessionId}:${userId}`, JSON.stringify({ choices: Object.fromEntries(entry.choices.map(c => [c.candidateId, c.choice])), savedAt: entry.createdAt }));
            queue.current?.dismissRejected(entry.sessionId);
          } catch { setStorageError(true); }
        }}>保留草稿并解除锁定</Button>}
      </div>)}
    </section>}
    {children}
  </Context.Provider>;
}