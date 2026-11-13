import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, Panel } from "@/components/Shell";
import { useSession, useSchool } from "@/lib/session";
import { submitBallot } from "@/lib/vote.functions";
import { loadJudgeCandidates } from "@/lib/judgeOrder";
import { pickVotingRule } from "@/lib/voteRules";
import { effectiveRoundRule } from "@/lib/rounds";
import { voteLabels } from "@/lib/voteLabels";
import { matchesFilter, nextPendingId, type VoteFilter } from "@/lib/voteNav";
import { Button } from "@/components/ui/button";
import { Crosshair, Type, Minus, Plus, CheckCircle2 } from "lucide-react";
import { VoteCandidateList } from "@/components/VoteCandidateList";
import { ListSkeleton } from "@/components/DataState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/vote/$sessionId")({
  head: () => ({ meta: [
    { title: "评委表决 — 职称评审推荐投票平台" },
    { name: "description", content: "按学科分组核对参评人员，完成本轮职称推荐表决与确认。" },
    { property: "og:title", content: "评委表决 — 职称评审推荐投票平台" },
    { property: "og:description", content: "按学科分组核对参评人员，完成本轮职称推荐表决与确认。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: VotePage,
});

type Choice = "recommend" | "not_recommend" | "abstain";

function VotePage() {
  const { sessionId } = Route.useParams();
  const { data: session } = useSession();
  const { data: school } = useSchool(session?.schoolId);
  const queryClient = useQueryClient();
  const submit = useServerFn(submitBallot);
  const labels = voteLabels(school);
  const choiceLabel = (choice: Choice) => labels[choice];

  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [overPick, setOverPick] = useState<{ candidateId: string; nextCount: number } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [ruleFloat, setRuleFloat] = useState<{ x: number; y: number } | null>(null);
  // 表态状态筛选：切换筛选时记录名单快照，表态后的人员不会立即从当前列表消失，避免误点
  const [filter, setFilter] = useState<VoteFilter>("all");
  const [filterIds, setFilterIds] = useState<Set<string> | null>(null);
  const [locatedId, setLocatedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [readingSize, setReadingSize] = useState<"standard" | "comfortable" | "large">("comfortable");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("vote-reading-size");
      if (stored === "standard" || stored === "comfortable" || stored === "large") setReadingSize(stored);
    } catch { /* Storage may be disabled. */ }
  }, []);
  function changeReadingSize(next: "standard" | "comfortable" | "large") {
    setReadingSize(next);
    try { localStorage.setItem("vote-reading-size", next); } catch { /* Optional preference. */ }
  }
  const flashTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["vote-session", sessionId, session?.userId],
    enabled: !!session?.userId,
    queryFn: async () => {
      const userId = session?.userId;
      if (!userId) throw new Error("登录状态已失效");
      const { data: judge } = await supabase
        .from("judges")
        .select("id, full_name, unit, title, school_id, group_id, is_committee_member")
        .eq("profile_id", userId)
        .maybeSingle();

      const { data: vs } = await supabase
        .from("vote_sessions")
        .select(
          "id, title, status, category_id, group_id, school_id, opened_at, closed_at, voter_scope, round_number, candidate_ids, max_recommend",
        )
        .eq("id", sessionId)
        .maybeSingle();
      const isCommittee = vs?.voter_scope === "committee";
      const outOfScope = isCommittee
        ? !(judge as { is_committee_member?: boolean } | null)?.is_committee_member
        : !!vs?.group_id && vs.voter_scope !== "all" && vs.group_id !== judge?.group_id;
      if (!vs || !judge || vs.school_id !== judge.school_id || outOfScope)
        return { judge, vs: null, candidates: [], rule: null, ballot: null, items: [] };

      const { candidates, groupNames } = await loadJudgeCandidates(supabase, vs);

      const { data: rules } = await supabase
        .from("voting_rules")
        .select("category_id, group_id, total_count, max_recommend, allow_abstain, require_all")
        .eq("school_id", vs.school_id);
      const rule = effectiveRoundRule(
        pickVotingRule(rules, vs.category_id, vs.group_id),
        vs,
        candidates.length,
      );

      const { data: ballot } = judge
        ? await supabase
            .from("ballots")
            .select("id, submitted_at")
            .eq("session_id", sessionId)
            .eq("judge_id", judge.id)
            .maybeSingle()
        : { data: null };

      const { data: items } = ballot
        ? await supabase
            .from("ballot_items")
            .select("candidate_id, choice")
            .eq("ballot_id", ballot.id)
        : { data: [] as { candidate_id: string; choice: Choice }[] };

      return {
        judge,
        vs,
        candidates,
        rule,
        ballot,
        items: items ?? [],
        groupNames,
      };
    },
  });

  const recommendCount = useMemo(
    () => Object.values(choices).filter((c) => c === "recommend").length,
    [choices],
  );

  // 草稿：未提交的选择自动保存在本机，离开页面后可恢复
  const draftKey = session?.userId ? `vote-draft:${sessionId}:${session.userId}` : null;
  const draftLoaded = useRef(false);
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const alreadySubmitted = !!data?.ballot;

  useEffect(() => {
    if (!draftKey || draftLoaded.current) return;
    draftLoaded.current = true;
    if (alreadySubmitted) {
      window.localStorage.removeItem(draftKey);
      return;
    }
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { choices?: Record<string, Choice>; savedAt?: string };
      if (parsed?.choices && Object.keys(parsed.choices).length > 0) {
        setChoices(parsed.choices);
        setDraftRestoredAt(parsed.savedAt ?? null);
        setDraftSavedAt(parsed.savedAt ?? null);
      }
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey, alreadySubmitted]);

  useEffect(() => {
    if (!draftKey || !draftLoaded.current || alreadySubmitted) return;
    if (Object.keys(choices).length === 0) {
      window.localStorage.removeItem(draftKey);
      setDraftSavedAt(null);
      return;
    }
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(draftKey, JSON.stringify({ choices, savedAt }));
    setDraftSavedAt(savedAt);
  }, [choices, draftKey, alreadySubmitted]);


  if (isLoading || !data) return <ListSkeleton rows={6} />;
  if (!data.vs) {
    return (
      <>
        <PageTitle title="投票" />
        <Panel>
          <p className="text-[12px] tracking-[0.1em] text-muted-foreground">投票不存在或未开放。</p>
        </Panel>
      </>
    );
  }

  const rule = data.rule;
  const hasGroupVotes = data.candidates.some((c) => (c.agree_votes ?? 0) > 0);
  const distinctGroups = new Set(data.candidates.map((c) => c.group_id ?? "none"));
  const showGroupHeaders = distinctGroups.size > 1;
  const groupLabel = (groupId: string | null) =>
    groupId ? (data.groupNames[groupId] ?? "未分组") : "未分组";
  const maxRecommend = rule?.max_recommend ?? 0;
  const overLimit = maxRecommend > 0 && recommendCount > maxRecommend;
  const underLimit = maxRecommend > 0 && recommendCount < maxRecommend;
  const remaining = maxRecommend > 0 ? maxRecommend - recommendCount : null;
  const missing = data.candidates.filter((c) => !choices[c.id]).length;
  const mustVoteAll = rule ? rule.require_all || !rule.allow_abstain : true;
  const showFloatingRule = data.candidates.length > 20;
  const overReason =
    maxRecommend > 0 && overLimit
      ? `${labels.recommend}人数超出名额：名额 ${maxRecommend} 人，已选 ${recommendCount} 人，超出 ${recommendCount - maxRecommend} 人，请改回 ${labels.recommend}后再提交`
      : null;
  const blockReason = !rule
    ? missing > 0
      ? `还有 ${missing} 人未表态，须对每位评审对象表态后方可提交`
      : null
    : overReason
      ? overReason
      : underLimit
        ? `${labels.recommend}人数不足，须${labels.recommend} ${maxRecommend} 人，还差 ${maxRecommend - recommendCount} 人`
        : mustVoteAll && missing > 0
          ? `还有 ${missing} 人未表态，须对每位评审对象表态后方可提交`
          : null;

  // 已提交：确认单
  if (data.ballot) {
    const map = new Map(data.items.map((i) => [i.candidate_id, i.choice as Choice]));
    const resultClass = (choice: Choice | undefined) =>
      choice === "recommend"
        ? "border-vote-recommend/30 bg-vote-recommend-bg text-vote-recommend"
        : choice === "not_recommend"
          ? "border-vote-reject/30 bg-vote-reject-bg text-vote-reject"
          : "border-border bg-muted text-muted-foreground";
    return (
      <>
        <div className="no-print">
          <PageTitle
            title="表决确认单"
            description={`已于 ${new Date(data.ballot.submitted_at).toLocaleString("zh-CN")} 提交，内容不可更改。`}
          />
        </div>
        <div className="print-area border bg-card p-10">
          <div className="mb-8 text-center">
            <div className="text-[15px] tracking-[0.2em]">{school?.name ?? ""}</div>
            <div className="mt-3 text-[13px] tracking-[0.16em]">{data.vs.title} 表决确认单</div>
          </div>
          <div className="mb-6 flex justify-between text-[12px] tracking-[0.1em] text-muted-foreground">
            <span>评委：{data.judge?.full_name}</span>
            <span>单位：{data.judge?.unit ?? "—"}</span>
            <span>提交时间：{new Date(data.ballot.submitted_at).toLocaleString("zh-CN")}</span>
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="hairline-b text-left tracking-[0.14em] text-muted-foreground">
                <th className="py-3 font-normal">姓名</th>
                <th className="py-3 font-normal">单位</th>
                <th className="py-3 font-normal">现职称</th>
                <th className="py-3 font-normal">表决</th>
              </tr>
            </thead>
            <tbody>
              {data.candidates.map((c) => (
                <tr key={c.id} className="hairline-b">
                  <td className="py-3 tracking-[0.1em]">{c.full_name}</td>
                  <td className="py-3 text-muted-foreground">{c.unit ?? "—"}</td>
                  <td className="py-3 text-muted-foreground">{c.current_title ?? "—"}</td>
                  <td className="py-3 tracking-[0.12em]">
                    <span
                      className={`inline-flex min-w-16 justify-center border px-3 py-1 ${resultClass(map.get(c.id))}`}
                    >
                      {map.get(c.id) ? choiceLabel(map.get(c.id) as Choice) : "未表态"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-16 flex justify-end pr-4 text-[12px] tracking-[0.16em]">
            <span>评委签字：</span>
            <span className="ml-2 inline-block w-48 border-b border-foreground/60" />
          </div>
        </div>
        <div className="no-print mt-8 flex gap-4">
          <Button onClick={() => window.print()} className="h-10 rounded-none text-[12px] tracking-[0.2em]">
            打印 / 存为 PDF
          </Button>
          <Link
            to="/vote"
            className="flex h-10 items-center border px-6 text-[12px] tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            返回列表
          </Link>
        </div>
      </>
    );
  }

  if (data.vs.status !== "open") {
    return (
      <>
        <PageTitle title={data.vs.title} />
        <Panel>
          <p className="text-[12px] tracking-[0.1em] text-muted-foreground">
            该场投票已结束，您未提交表决。
          </p>
        </Panel>
      </>
    );
  }

  async function doSubmit() {
    setSaving(true);
    try {
      await submit({
        data: {
          sessionId,
          choices: Object.entries(choices).map(([candidateId, choice]) => ({
            candidateId,
            choice,
          })),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["vote-session", sessionId] });
      await queryClient.invalidateQueries({ queryKey: ["judge-sessions"] });
      if (draftKey) window.localStorage.removeItem(draftKey);
      setDraftSavedAt(null);
      setDraftRestoredAt(null);
      toast.success("表决已提交");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSaving(false);
      setConfirmOpen(false);
      await queryClient.refetchQueries({ queryKey: ["vote-session", sessionId] });
    }
  }

  function pick(candidateId: string, value: "recommend" | "not_recommend") {
    setLocatedId(candidateId);
    if (choices[candidateId] === value) {
      // 再次点击已选项：撤销为未表态
      setChoices((p) => {
        const next = { ...p };
        delete next[candidateId];
        return next;
      });
      return;
    }
    if (value === "recommend" && maxRecommend > 0 && recommendCount >= maxRecommend) {
      setOverPick({ candidateId, nextCount: recommendCount + 1 });
      return;
    }
    setChoices((p) => ({ ...p, [candidateId]: value }));
  }

  function applyFilter(next: VoteFilter) {
    setLocatedId(null);
    setFilter(next);
    setFilterIds(
      next === "all"
        ? null
        : new Set(data.candidates.filter((c) => matchesFilter(choices[c.id], next)).map((c) => c.id)),
    );
  }

  function locateNextPending() {
    const id = nextPendingId(
      data.candidates.map((c) => c.id),
      choices,
      locatedId,
    );
    if (!id) {
      toast.success("已全部表态");
      return;
    }
    // 当前筛选看不到该人员时切回「未表态」视图
    if (filterIds && !filterIds.has(id)) applyFilter("pending");
    setLocatedId(id);
    setFlashId(id);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(null), 1800);

  }

  const visibleCandidates = filterIds
    ? data.candidates.filter((c) => filterIds.has(c.id))
    : data.candidates;
  const countRecommend = recommendCount;
  const countReject = data.candidates.filter((c) => choices[c.id] === "not_recommend").length;
  const filterTabs: { key: VoteFilter; label: string; count: number; activeClass: string }[] = [
    { key: "all", label: "全部", count: data.candidates.length, activeClass: "bg-foreground text-background" },
    { key: "pending", label: "未表态", count: missing, activeClass: "bg-primary text-primary-foreground" },
    {
      key: "recommend",
      label: `已${labels.recommend}`,
      count: countRecommend,
      activeClass: "bg-vote-recommend-bg text-vote-recommend",
    },
    {
      key: "not_recommend",
      label: labels.not_recommend,
      count: countReject,
      activeClass: "bg-vote-reject-bg text-vote-reject",
    },
  ];

  return (
    <>
      <PageTitle
        title={data.vs.title}
        description={
          ((data.vs.round_number ?? 1) > 1 ? `第 ${data.vs.round_number} 轮 · ` : "") +
          (rule
            ? `本场参评 ${data.candidates.length} 人，${labels.recommend}名额 ${maxRecommend} 人，实时显示剩余名额，超出名额无法提交。${mustVoteAll ? "须对每位评审对象表态。" : ""}`
            : `本场参评 ${data.candidates.length} 人，请对每位评审对象逐一表态后方可提交。`)
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-[12px] tracking-[0.1em] text-muted-foreground">
        <span>
          {draftSavedAt
            ? `未提交的选择已自动保存（${new Date(draftSavedAt).toLocaleTimeString("zh-CN")}），离开页面后可继续填写`
            : "未提交的选择会自动保存在本机，离开页面后可继续填写"}
        </span>
        {draftRestoredAt ? (
          <>
            <span className="text-foreground">
              已恢复 {new Date(draftRestoredAt).toLocaleString("zh-CN")} 的未提交选择
            </span>
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => {
                setChoices({});
                setDraftRestoredAt(null);
              }}
            >
              清空重填
            </button>
          </>
        ) : null}
      </div>

      {/* 表态状态切换 + 未表态人员快速定位：常驻顶部，滚动时不消失 */}
      <div className="vote-toolbar sticky top-0 z-20 mb-3 border-y bg-background/95 py-3 backdrop-blur">
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0 text-[14px]" role="status" aria-live="polite" aria-atomic="true">
            <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
              <span>表态完成 {data.candidates.length - missing}/{data.candidates.length}</span>
              <span className={overLimit ? "text-destructive" : "text-vote-recommend"}>已{labels.recommend} {recommendCount}{maxRecommend > 0 ? `/${maxRecommend}` : ""}</span>
              {remaining !== null ? <span className={remaining < 0 ? "text-destructive" : "text-muted-foreground"}>{remaining < 0 ? `超额 ${-remaining} 人` : `剩余 ${remaining} 人`}</span> : null}
            </div>
            <div className={`mt-1 ${blockReason ? "text-muted-foreground" : "text-vote-recommend"}`}>
              {blockReason ?? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4 shrink-0" />符合规则，可以提交</span>}
            </div>
          </div>
          <div role="group" aria-label="名单字号" className="grid grid-cols-3 shrink-0 border">
            <Button variant="ghost" size="icon" title="标准字号（12）" aria-label="标准字号" aria-pressed={readingSize === "standard"} onClick={() => changeReadingSize("standard")} className={`h-11 w-11 rounded-none ${readingSize === "standard" ? "bg-muted" : ""}`}><Minus /></Button>
            <Button variant="ghost" size="icon" title="舒适字号（14）" aria-label="舒适字号" aria-pressed={readingSize === "comfortable"} onClick={() => changeReadingSize("comfortable")} className={`h-11 w-11 rounded-none border-x ${readingSize === "comfortable" ? "bg-muted" : ""}`}><Type /></Button>
            <Button variant="ghost" size="icon" title="放大字号（16）" aria-label="放大字号" aria-pressed={readingSize === "large"} onClick={() => changeReadingSize("large")} className={`h-11 w-11 rounded-none ${readingSize === "large" ? "bg-muted" : ""}`}><Plus /></Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="按表态状态筛选" className="grid w-full grid-cols-4 border sm:w-auto">
          {filterTabs.map((t) => (
            <Button
              variant="ghost"
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter === t.key}
              onClick={() => applyFilter(t.key)}
              className={`min-h-11 h-auto min-w-0 whitespace-normal rounded-none px-2 py-2 text-[12px] transition-colors [&+&]:border-l ${
                filter === t.key
                  ? t.activeClass
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {t.label}
              <span className="ml-1.5 tabular-nums">{t.count}</span>
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={locateNextPending}
          disabled={missing === 0}
          className="min-h-11 h-auto whitespace-normal rounded-none text-[12px]"
        >
          <Crosshair className="mr-1.5 h-4 w-4" />
          {missing === 0 ? "已全部表态" : `定位下一个未表态（${missing}）`}
        </Button>
        {filterIds && filter !== "all" ? (
          <button
            type="button"
            onClick={() => applyFilter(filter)}
            className="text-[11px] tracking-[0.1em] text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            刷新筛选结果
          </button>
        ) : null}
        </div>
      </div>

      <div className="vote-reading" data-reading-size={readingSize}
        onMouseMove={(event) => {
          if (!showFloatingRule || !window.matchMedia("(hover: hover) and (min-width: 1024px)").matches) return;
          const panelWidth = 310;
          const panelHeight = 126;
          const gap = 18;
          const x = Math.min(event.clientX + gap, window.innerWidth - panelWidth - gap);
          const y = Math.min(event.clientY + gap, window.innerHeight - panelHeight - gap);
          setRuleFloat({ x: Math.max(gap, x), y: Math.max(gap, y) });
        }}
        onMouseLeave={() => setRuleFloat(null)}
      >
        <VoteCandidateList
          candidates={visibleCandidates} choices={choices} groupNames={data.groupNames ?? {}}
          showGroups={showGroupHeaders} showVotes={hasGroupVotes}
          activeId={locatedId} flashId={flashId} labels={labels}
          keyboardEnabled={!confirmOpen && !ruleOpen && !overPick && !saving}
          onActivate={setLocatedId} onPick={pick} onPending={locateNextPending}
          emptyText={filter === "pending" ? "已全部表态" : "当前筛选下没有人员"}
          onShowAll={() => applyFilter("all")}
        />
      </div>

      {showFloatingRule && ruleFloat ? (
        <aside
          className="pointer-events-none fixed z-40 hidden w-[310px] border border-primary/40 bg-card p-4 text-[12px] leading-loose shadow-sm lg:block"
          style={{ left: ruleFloat.x, top: ruleFloat.y }}
          aria-live="polite"
        >
          <div className="mb-1 tracking-[0.12em] text-muted-foreground">投票规则提醒</div>
          <div className="tracking-[0.08em]">
            本轮{labels.recommend}名额 <span className="text-primary">{maxRecommend}</span> 人
            <br />
            当前已{labels.recommend} <span className="text-primary">{recommendCount}</span> 人
            <br />
            <span className={remaining !== null && remaining < 0 ? "text-destructive" : ""}>
              剩余{labels.recommend}名额 {Math.max(remaining ?? 0, 0)} 人
            </span>
            <br />
            尚有 {missing} 人未表态
          </div>
        </aside>
      ) : null}

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] tracking-[0.14em]">
          <span className={overLimit ? "text-destructive" : "text-muted-foreground"}>
            已{labels.recommend} {recommendCount}
            {maxRecommend > 0 ? ` / ${maxRecommend}` : ""} 人
          </span>
          {remaining !== null ? (
            <span className={remaining < 0 ? "ml-6 text-destructive" : "ml-6"}>
              {remaining < 0
                ? `超出名额 ${-remaining} 人，无法提交`
                : `剩余${labels.recommend}名额 ${remaining} 人`}
            </span>
          ) : null}
          {missing > 0 ? (
            <span className="ml-6 text-muted-foreground">未表态 {missing} 人</span>
          ) : null}
          {blockReason ? (
            <span className="ml-6 text-destructive">{blockReason}</span>
          ) : null}
        </div>
        <Button
          disabled={saving || data.candidates.length === 0}
          onClick={() => {
            if (blockReason) {
              setRuleOpen(true);
              return;
            }
            setConfirmOpen(true);
          }}
          className={`min-h-11 h-auto whitespace-normal rounded-none px-10 py-3 text-[14px] ${!blockReason ? "ring-2 ring-vote-recommend/40 ring-offset-2 ring-offset-background" : ""}`}
        >
          提交表决
        </Button>
      </div>

      {/* 名额已满仍选择推荐：明确提醒规则数与剩余名额，由评委决定是否继续 */}
      <AlertDialog
        open={!!overPick}
        onOpenChange={(o) => {
          if (!o) setOverPick(null);
        }}
      >
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[14px] tracking-[0.16em]">
              {labels.recommend}名额提醒
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] leading-loose tracking-[0.1em]">
              本轮规则：须{labels.recommend} {maxRecommend} 人，剩余名额{" "}
              {Math.max(maxRecommend - recommendCount, 0)} 人。
              <br />
              若继续将超出名额{" "}
              {overPick ? overPick.nextCount - maxRecommend : 0} 人，超出后无法提交。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="rounded-none text-[12px] tracking-[0.2em]"
              onClick={() => setOverPick(null)}
            >
              取消本次选择
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (overPick) {
                  const { candidateId } = overPick;
                  setChoices((p) => ({ ...p, [candidateId]: "recommend" }));
                }
                setOverPick(null);
              }}
              className="rounded-none text-[12px] tracking-[0.2em]"
            >
              继续投票（保留选择，稍后调整）
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 提交时人数与规则不符：说明规则数与剩余名额，决定是否继续投票 */}
      <AlertDialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[14px] tracking-[0.16em]">
              {labels.recommend}人数与规则不符
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] leading-loose tracking-[0.1em]">
              {rule
                ? `本轮规则：须${labels.recommend} ${maxRecommend} 人，当前已${labels.recommend} ${recommendCount} 人，剩余名额 ${Math.max(maxRecommend - recommendCount, 0)} 人${
                    overLimit
                      ? `，已超出 ${recommendCount - maxRecommend} 人`
                      : underLimit
                        ? `，还差 ${maxRecommend - recommendCount} 人`
                        : ""
                  }。`
                : `尚有 ${missing} 人未表态，须对每位评审对象表态后方可提交。`}
              {blockReason ? (
                <>
                  <br />
                  {blockReason}
                </>
              ) : null}
              <br />
              是否继续投票（返回调整选择）？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setRuleOpen(false);
              }}
              className="rounded-none text-[12px] tracking-[0.2em]"
            >
              继续投票
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl rounded-none md:max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[14px] tracking-[0.16em]">确认提交</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] leading-loose tracking-[0.1em]">
              本次共{labels.recommend} {recommendCount} 人
              {missing > 0 ? `，未表态 ${missing} 人` : ""}。提交后不可修改，是否确认？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-80 overflow-auto">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] leading-loose sm:grid-cols-3 md:grid-cols-4">
              {data.candidates
                .filter((c) => choices[c.id] === "recommend")
                .map((c, i) => (
                  <div key={c.id} className="flex items-baseline gap-2 tracking-[0.1em]">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <span>{c.full_name}</span>
                  </div>
                ))}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none text-[12px] tracking-[0.2em]">
              返回修改
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doSubmit();
              }}
              className="rounded-none text-[12px] tracking-[0.2em]"
            >
              确认提交
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
