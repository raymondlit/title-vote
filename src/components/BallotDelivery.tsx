import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { submitBallot } from "@/lib/vote.functions";
import { BallotQueue, type BallotPayload, type QueueEntry } from "@/lib/ballotQueue";
import { Button } from "@/components/ui/button";

type Delivery = { entries: QueueEntry[]; enqueue: (payload: BallotPayload, title: string) => void };
const Context = createContext<Delivery>({ entries: [], enqueue: () => { throw new Error("选票暂存尚未就绪，请稍后再试"); } });
export function useBallotDelivery() { return useContext(Context); }

export function BallotDelivery({ userId, children }: { userId?: string; children: ReactNode }) {
  const submit = useServerFn(submitBallot);
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [online, setOnline] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const queue = useRef<BallotQueue | null>(null);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    setEntries([]);
    if (!userId) return;
    let active = true;
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
        const { data } = await supabase.auth.getSession();
        return data.session?.user.id ?? null;
      }, payload => submitRef.current({ data: payload }), entry => {
        try { localStorage.removeItem(`vote-draft:${entry.sessionId}:${userId}`); } catch { /* Optional cleanup. */ }
        if (!active) return;
        void queryClient.invalidateQueries({ queryKey: ["vote-session", entry.sessionId] });
        void queryClient.invalidateQueries({ queryKey: ["judge-sessions"] });
        toast.success(`${entry.title}：服务器已确认提交`);
      }).catch(() => { if (active) setStorageError(true); });
    };
    pump();
    const interval = window.setInterval(pump, 1000);
    window.addEventListener("online", pump);
    window.addEventListener("offline", pump);
    window.addEventListener("focus", pump);
    const warn = (event: BeforeUnloadEvent) => {
      if (engine.entries.length) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      active = false;
      queue.current = null;
      window.clearInterval(interval);
      window.removeEventListener("online", pump);
      window.removeEventListener("offline", pump);
      window.removeEventListener("focus", pump);
      window.removeEventListener("beforeunload", warn);
    };
  }, [userId, queryClient]);
  return <Context.Provider value={{ entries, enqueue: (payload, title) => {
    const engine = queue.current;
    if (!engine || storageError) throw new Error("无法安全保存选票，请允许浏览器存储后再提交；当前选择未清除");
    engine.enqueue(payload, title);
  } }}>
    {(!online || entries.length > 0 || storageError) && <section aria-label="选票提交状态" aria-live="polite" className="mb-6 border-y border-border bg-muted px-4 py-3 text-sm">
      {!online && <p className="flex items-center gap-2"><WifiOff className="size-4" />网络已断开；已确认的选票等待联网提交，尚未计入结果。</p>}
      {storageError && <p className="text-destructive">无法安全暂存选票，请检查浏览器存储；不要关闭页面或清理数据。</p>}
      {entries.map(entry => <div key={entry.sessionId} className="flex flex-wrap items-center gap-3 py-2">
        {entry.state === "sending" && <Loader2 className="size-4 animate-spin" />}
        <span className="font-medium">{entry.title}</span>
        <span className={entry.state === "rejected" ? "text-destructive" : "text-muted-foreground"}>{entry.message}。{entry.state !== "rejected" && "请勿清理浏览器数据；暂存不等于提交成功。"}</span>
        {entry.state === "waiting" && <Button variant="outline" size="sm" disabled={!online} onClick={() => queue.current?.retryNow(entry.sessionId)}>立即重试</Button>}
        {entry.state === "rejected" && <Button variant="outline" size="sm" onClick={() => queue.current?.dismissRejected(entry.sessionId)}>保留草稿并解除锁定</Button>}
      </div>)}
    </section>}
    {children}
  </Context.Provider>;
}