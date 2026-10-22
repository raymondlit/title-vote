import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { escapeHtml, openPrintWindow, printDocumentHtml } from "@/lib/print";
import {
  defaultPassedIds,
  fetchAllBallotItems,
  nextRoundTitle,
  remainingAfterRound,
  roundChain,
  type RoundFields,
} from "@/lib/rounds";

type SessionRow = RoundFields & {
  school_id: string;
  category_id: string | null;
  group_id: string | null;
  voter_scope: string;
};

type Props = {
  current: SessionRow;
  sessions: SessionRow[];
  rows: { id: string; name: string; recommend: number }[];
  poolIds: string[];
  quota: number;
  schoolName: string;
  recommendLabel: string;
  onCreated: (sessionId: string) => void;
};

/** 多轮差额遴选：确认本轮通过名单、发起下一轮、全轮次汇总 */
export function RoundPanel({
  current,
  sessions,
  rows,
  poolIds,
  quota,
  schoolName,
  recommendLabel,
  onCreated,
}: Props) {
  const queryClient = useQueryClient();
  const round = current.round_number ?? 1;
  const confirmed = Array.isArray(current.passed_candidate_ids);
  const closed = current.status === "closed";
  const child = sessions.find((s) => s.parent_session_id === current.id) ?? null;

  const [passed, setPassed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const initKey = `${current.id}|${(current.passed_candidate_ids ?? []).join(",")}|${current.status}`;
  useEffect(() => {
    setPassed(
      new Set(current.passed_candidate_ids ?? (closed ? defaultPassedIds(rows, quota) : [])),
    );
    // 仅在切换场次或通过名单变化时重置，避免实时刷新覆盖管理员的勾选
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey]);

  const [openNext, setOpenNext] = useState(false);
  const [nextTitle, setNextTitle] = useState("");
  const [nextQuota, setNextQuota] = useState("");
  const [nextPool, setNextPool] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const nameById = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);
  const passedList = current.passed_candidate_ids ?? [];
  const remaining = remainingAfterRound(poolIds, passedList);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["result-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["round-summary"] });
  }

  async function savePassed() {
    setSaving(true);
    const { error } = await supabase
      .from("vote_sessions")
      .update({
        passed_candidate_ids: [...passed],
        // 冻结本轮参评名单，保证后续轮次与汇总可追溯
        candidate_ids: current.candidate_ids ?? poolIds,
      })
      .eq("id", current.id)
      .eq("school_id", current.school_id);
    setSaving(false);
    if (error) {
      toast.error("保存失败：" + error.message);
      return;
    }
    toast.success(`已确认第 ${round} 轮通过名单 ${passed.size} 人`);
    refresh();
  }

  function startNext() {
    setNextTitle(nextRoundTitle(current.title, round + 1));
    setNextQuota("");
    setNextPool(new Set(remaining));
    setOpenNext(true);
  }

  async function createNext() {
    const quotaNum = nextQuota.trim() === "" ? null : Number(nextQuota);
    if (quotaNum !== null && (!Number.isInteger(quotaNum) || quotaNum < 1)) {
      toast.error("本轮推荐名额须为正整数");
      return;
    }
    if (nextPool.size === 0) {
      toast.error("下一轮至少需要一名参评人员");
      return;
    }
    if (quotaNum !== null && quotaNum > nextPool.size) {
      toast.error(`推荐名额 ${quotaNum} 人超过参评人数 ${nextPool.size} 人`);
      return;
    }
    if (!nextTitle.trim()) {
      toast.error("请填写场次名称");
      return;
    }
    setCreating(true);
    const ordered = poolIds.filter((id) => nextPool.has(id));
    const { data, error } = await supabase
      .from("vote_sessions")
      .insert({
        school_id: current.school_id,
        title: nextTitle.trim(),
        category_id: current.category_id,
        group_id: current.group_id,
        voter_scope: current.voter_scope,
        round_number: round + 1,
        parent_session_id: current.id,
        candidate_ids: ordered,
        max_recommend: quotaNum,
      })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("创建失败：" + (error?.message ?? "未知错误"));
      return;
    }
    setOpenNext(false);
    toast.success(`已创建第 ${round + 1} 轮（${ordered.length} 人），请到「投票场次」开启投票`);
    refresh();
    onCreated(data.id);
  }

  const chain = useMemo(() => roundChain(sessions, current.id), [sessions, current.id]);
  const chainKey = chain
    .map((s) => `${s.id}:${s.status}:${(s.passed_candidate_ids ?? []).length}`)
    .join("|");

  const { data: summary } = useQuery({
    queryKey: ["round-summary", chainKey],
    enabled: chain.length > 1 || confirmed,
    queryFn: async () => {
      const allIds = new Set<string>();
      for (const s of chain) {
        (s.candidate_ids ?? []).forEach((id) => allIds.add(id));
        (s.passed_candidate_ids ?? []).forEach((id) => allIds.add(id));
      }
      const [{ data: cands }, { data: ballots }] = await Promise.all([
        allIds.size
          ? supabase.from("candidates").select("id, full_name").in("id", [...allIds])
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
        supabase
          .from("ballots")
          .select("id, session_id")
          .in(
            "session_id",
            chain.map((s) => s.id),
          ),
      ]);
      const sessionOfBallot = new Map((ballots ?? []).map((b) => [b.id, b.session_id]));
      const items = await fetchAllBallotItems(
        supabase,
        (ballots ?? []).map((b) => b.id),
      );
      const votes = new Map<string, number>();
      for (const it of items) {
        if (it.choice !== "recommend") continue;
        const key = `${sessionOfBallot.get(it.ballot_id)}|${it.candidate_id}`;
        votes.set(key, (votes.get(key) ?? 0) + 1);
      }
      const names = new Map((cands ?? []).map((c) => [c.id, c.full_name]));
      return chain.map((s) => ({
        id: s.id,
        round: s.round_number ?? 1,
        title: s.title,
        status: s.status,
        poolSize: s.candidate_ids?.length ?? (s.id === current.id ? poolIds.length : null),
        quota: s.max_recommend ?? null,
        confirmed: Array.isArray(s.passed_candidate_ids),
        passed: (s.passed_candidate_ids ?? [])
          .map((id) => ({
            name: names.get(id) ?? "（已删除）",
            votes: votes.get(`${s.id}|${id}`) ?? 0,
          }))
          .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, "zh-Hans-CN")),
        notPassed:
          s.candidate_ids && s.passed_candidate_ids
            ? remainingAfterRound(s.candidate_ids, s.passed_candidate_ids).map(
                (id) => names.get(id) ?? "（已删除）",
              )
            : [],
      }));
    },
  });

  const last = summary?.[summary.length - 1];
  const totalPassed = (summary ?? []).reduce((n, r) => n + r.passed.length, 0);

  function printSummary() {
    if (!summary) return;
    const body = `<h1>${escapeHtml(schoolName)}</h1>
<p class="sub">${escapeHtml(chain[0]?.title ?? "")} · 全轮次遴选汇总表</p>
<table><thead><tr><th style="width:72px">轮次</th><th style="width:72px">参评</th><th style="width:72px">名额</th><th>通过名单（${escapeHtml(recommendLabel)}票数）</th></tr></thead><tbody>${summary
      .map(
        (r) =>
          `<tr><td>第 ${r.round} 轮</td><td>${r.poolSize ?? "—"}</td><td>${r.quota ?? "按规则"}</td><td>${
            r.confirmed
              ? r.passed.map((p) => `${escapeHtml(p.name)}（${p.votes}）`).join("、") || "无"
              : "尚未确认"
          }</td></tr>`,
      )
      .join("")}</tbody></table>
<p class="foot">累计通过 ${totalPassed} 人${
      last?.confirmed ? `；最终未通过 ${last.notPassed.length} 人：${escapeHtml(last.notPassed.join("、") || "无")}` : ""
    }<br />打印日期：${new Date().toLocaleDateString("zh-CN")} &nbsp;&nbsp;&nbsp; 主任委员签字：________________</p>`;
    if (!openPrintWindow(printDocumentHtml({ title: "全轮次遴选汇总表", body }))) {
      toast.error("浏览器阻止了打印窗口，请允许弹出窗口后重试");
    }
  }

  return (
    <Panel className="no-print mb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[12px] tracking-[0.16em]">
            <Layers className="h-4 w-4" /> 多轮遴选 · 第 {round} 轮
          </div>
          <p className="mt-2 text-[11px] leading-6 tracking-[0.1em] text-muted-foreground">
            本轮参评 {poolIds.length} 人
            {quota > 0 ? ` · ${recommendLabel}名额 ${quota} 人` : ""}
            {confirmed ? ` · 已确认通过 ${passedList.length} 人` : " · 尚未确认通过名单"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {child ? (
            <Button variant="outline" className="rounded-none" onClick={() => onCreated(child.id)}>
              查看第 {child.round_number ?? round + 1} 轮
            </Button>
          ) : (
            <Button
              className="rounded-none"
              disabled={!closed || !confirmed || remaining.length === 0}
              onClick={startNext}
            >
              发起下一轮投票
            </Button>
          )}
        </div>
      </div>

      {!closed ? (
        <p className="mt-6 text-[12px] tracking-[0.1em] text-muted-foreground">
          本轮投票结束后，可在此确认通过名单，并由剩余人员发起下一轮投票。
        </p>
      ) : (
        <div className="mt-8">
          <div className="mb-4 flex flex-wrap items-center gap-4 text-[11px] tracking-[0.14em] text-muted-foreground">
            <span>勾选本轮通过人员（已选 {passed.size} 人）</span>
            <button
              type="button"
              className="underline"
              onClick={() => setPassed(new Set(defaultPassedIds(rows, quota)))}
            >
              按得票取前 {quota || 0} 名
            </button>
            <button type="button" className="underline" onClick={() => setPassed(new Set())}>
              清空
            </button>
          </div>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r, i) => (
              <label
                key={r.id}
                className="hairline-b flex items-center gap-3 py-2 text-[12px] tracking-[0.08em]"
              >
                <input
                  type="checkbox"
                  disabled={!!child}
                  checked={passed.has(r.id)}
                  onChange={(e) =>
                    setPassed((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      return next;
                    })
                  }
                />
                <span className="w-6 text-muted-foreground">{i + 1}</span>
                <span className="flex-1">{r.name}</span>
                <span className="text-muted-foreground">
                  {r.recommend} 票{passed.has(r.id) ? " · 通过" : ""}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button
              variant="outline"
              className="rounded-none"
              disabled={saving || !!child}
              onClick={savePassed}
            >
              {confirmed ? "更新通过名单" : "确认本轮通过名单"}
            </Button>
            {quota > 0 && passed.size !== quota ? (
              <span className="text-[11px] tracking-[0.1em] text-destructive">
                本轮名额 {quota} 人，当前勾选 {passed.size} 人
              </span>
            ) : null}
            {child ? (
              <span className="text-[11px] tracking-[0.1em] text-muted-foreground">
                已发起下一轮，本轮通过名单已锁定
              </span>
            ) : confirmed ? (
              <span className="text-[11px] tracking-[0.1em] text-muted-foreground">
                下一轮将自动剔除已通过的 {passedList.length} 人，剩余 {remaining.length} 人
              </span>
            ) : null}
          </div>
        </div>
      )}

      {summary && summary.length > 0 ? (
        <div className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-[12px] tracking-[0.16em]">全轮次遴选汇总</div>
            <Button variant="outline" className="rounded-none" onClick={printSummary}>
              <Printer /> 打印汇总表
            </Button>
          </div>
          <table className="mt-6 w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-muted/50 tracking-[0.1em]">
                <th className="w-20 border border-border px-3 py-2 font-normal">轮次</th>
                <th className="w-20 border border-border px-3 py-2 font-normal">参评</th>
                <th className="w-20 border border-border px-3 py-2 font-normal">名额</th>
                <th className="border border-border px-3 py-2 text-left font-normal">
                  通过名单（{recommendLabel}票数）
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.id} className={r.id === current.id ? "bg-muted/30" : undefined}>
                  <td className="border border-border px-3 py-2 text-center">第 {r.round} 轮</td>
                  <td className="border border-border px-3 py-2 text-center">{r.poolSize ?? "—"}</td>
                  <td className="border border-border px-3 py-2 text-center">{r.quota ?? "按规则"}</td>
                  <td className="border border-border px-3 py-2 leading-6">
                    {r.confirmed
                      ? r.passed.map((p) => `${p.name}（${p.votes}）`).join("、") || "无"
                      : r.status === "closed"
                        ? "尚未确认"
                        : "投票未结束"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-[11px] leading-6 tracking-[0.1em] text-muted-foreground">
            累计通过 {totalPassed} 人
            {last?.confirmed
              ? `；最终未通过 ${last.notPassed.length} 人：${last.notPassed.join("、") || "无"}`
              : ""}
          </p>
        </div>
      ) : null}

      <Dialog open={openNext} onOpenChange={setOpenNext}>
        <DialogContent className="max-w-3xl rounded-none">
          <DialogHeader>
            <DialogTitle className="font-normal tracking-[0.12em]">
              发起第 {round + 1} 轮投票
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-6">
              已自动剔除本轮通过的 {passedList.length} 人，可按需勾选调整。评审类别、学科组与参与评委沿用本轮设置。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <div className="space-y-2">
              <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">场次名称</Label>
              <Input
                value={nextTitle}
                onChange={(e) => setNextTitle(e.target.value)}
                className="rounded-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">
                本轮{recommendLabel}名额
              </Label>
              <Input
                type="number"
                min={1}
                value={nextQuota}
                onChange={(e) => setNextQuota(e.target.value)}
                placeholder="留空按规则"
                className="rounded-none"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px] tracking-[0.14em] text-muted-foreground">
            <span>本轮参评 {nextPool.size} 人</span>
            <button type="button" className="underline" onClick={() => setNextPool(new Set(remaining))}>
              恢复默认
            </button>
            <button type="button" className="underline" onClick={() => setNextPool(new Set(poolIds))}>
              全选
            </button>
            <button
              type="button"
              className="underline"
              onClick={() => setNextPool(new Set(poolIds.filter((id) => !nextPool.has(id))))}
            >
              反选
            </button>
          </div>
          <div className="grid max-h-80 gap-x-6 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
            {poolIds.map((id) => (
              <label
                key={id}
                className="hairline-b flex items-center gap-3 py-2 text-[12px] tracking-[0.08em]"
              >
                <input
                  type="checkbox"
                  checked={nextPool.has(id)}
                  onChange={(e) =>
                    setNextPool((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(id);
                      else next.delete(id);
                      return next;
                    })
                  }
                />
                <span className="flex-1">{nameById.get(id) ?? "—"}</span>
                {passedList.includes(id) ? (
                  <span className="text-[10px] text-muted-foreground">已通过</span>
                ) : null}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => setOpenNext(false)}>
              取消
            </Button>
            <Button className="rounded-none" disabled={creating} onClick={createNext}>
              创建第 {round + 1} 轮场次
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
