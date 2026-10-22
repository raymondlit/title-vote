import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, Panel } from "@/components/Shell";
import { useSession, useSchool } from "@/lib/session";
import { submitBallot } from "@/lib/vote.functions";
import { fetchRecommendedCandidateIds } from "@/lib/committee";
import { pickVotingRule } from "@/lib/voteRules";
import { effectiveRoundRule, hasFixedPool } from "@/lib/rounds";
import { voteLabels } from "@/lib/voteLabels";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

      let base: { id: string; full_name: string; unit: string | null; current_title: string | null; group_id: string | null }[];
      if (hasFixedPool(vs)) {
        // 多轮遴选：本轮只展示固定名单内人员
        const { data: pooled } = await supabase
          .from("candidates")
          .select("id, full_name, unit, current_title, group_id")
          .eq("school_id", vs.school_id)
          .in("id", vs.candidate_ids ?? [])
          .order("full_name");
        base = pooled ?? [];
      } else {
        let cq = supabase
          .from("candidates")
          .select("id, full_name, unit, current_title, group_id")
          .eq("school_id", vs.school_id)
          .order("full_name");
        if (vs.category_id) cq = cq.eq("category_id", vs.category_id);
        if (vs.group_id) cq = cq.eq("group_id", vs.group_id);
        const { data: candidatesRaw } = await cq;
        base = candidatesRaw ?? [];
        if (isCommittee) {
          const recommended = await fetchRecommendedCandidateIds(
            supabase,
            vs.school_id,
            vs.category_id,
          );
          base = base.filter((c) => recommended.has(c.id));
        }
      }

      // 学科组线下推荐票数：有票数时按票数从高到低排序
      const { data: offline } = await supabase
        .from("offline_group_results")
        .select("candidate_id, agree_votes, total_votes")
        .eq("school_id", vs.school_id)
        .in(
          "candidate_id",
          base.map((c) => c.id),
        );
      const voteMap = new Map(
        (offline ?? []).map((o) => [
          o.candidate_id,
          { agree: o.agree_votes ?? 0, total: o.total_votes ?? 0 },
        ]),
      );
      let candidates = base.map((c) => ({
        ...c,
        agree_votes: voteMap.get(c.id)?.agree ?? null,
        total_votes: voteMap.get(c.id)?.total ?? null,
      }));
      // 学科组信息：分组排序时显示组名
      const { data: subjectGroups } = await supabase
        .from("subject_groups")
        .select("id, name")
        .eq("school_id", vs.school_id);
      const groupName = new Map((subjectGroups ?? []).map((g) => [g.id, g.name]));

      const multiGroup = new Set(candidates.map((c) => c.group_id ?? "none")).size > 1;
      if (multiGroup) {
        // 自动按学科分类分组排序：组间按组名排序，组内按推荐票数从高到低、票数相同按姓名
        const byGroup = new Map<string | null, typeof candidates>();
        for (const c of candidates) {
          const key = c.group_id ?? null;
          const arr = byGroup.get(key) ?? [];
          arr.push(c);
          byGroup.set(key, arr);
        }
        const orderedGroups = [...byGroup.entries()].sort(([a], [b]) => {
          const na = a ? (groupName.get(a) ?? "") : "￿"; // 未分组排最后
          const nb = b ? (groupName.get(b) ?? "") : "￿";
          return na.localeCompare(nb, "zh-CN");
        });
        candidates = orderedGroups.flatMap(([, arr]) =>
          [...arr].sort(
            (a, b) =>
              (b.agree_votes ?? 0) - (a.agree_votes ?? 0) ||
              a.full_name.localeCompare(b.full_name, "zh-CN"),
          ),
        );
      }

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
        groupNames: Object.fromEntries(groupName),
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


  if (isLoading || !data) return <div />;
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

      <Panel className="mb-6 border-primary/40 bg-primary/5">
        <div className="text-[12px] leading-loose tracking-[0.1em]">
          <span className="mr-4 text-muted-foreground">投票规则提醒</span>
          {rule ? (
            <>
              <span>
                本轮{labels.recommend}名额 <span className="text-primary">{maxRecommend}</span> 人
              </span>
              <span className="ml-6 text-muted-foreground">
                当前已{labels.recommend} {recommendCount} 人
              </span>
              {remaining !== null ? (
                <span className={remaining < 0 ? "ml-6 text-destructive" : "ml-6 text-primary"}>
                  {remaining < 0
                    ? `已超出名额 ${-remaining} 人，无法提交`
                    : `剩余${labels.recommend}名额 ${remaining} 人`}
                </span>
              ) : null}
              {mustVoteAll ? (
                <span className="ml-6 text-muted-foreground">
                  {missing > 0 ? `尚有 ${missing} 人未表态` : "已全部表态"}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">
              请对每位评审对象逐一表态，未全部表态无法提交
            </span>
          )}
        </div>
      </Panel>

      <div
        onMouseMove={(event) => {
          if (!showFloatingRule) return;
          const panelWidth = 310;
          const panelHeight = 126;
          const gap = 18;
          const x = Math.min(event.clientX + gap, window.innerWidth - panelWidth - gap);
          const y = Math.min(event.clientY + gap, window.innerHeight - panelHeight - gap);
          setRuleFloat({ x: Math.max(gap, x), y: Math.max(gap, y) });
        }}
        onMouseLeave={() => setRuleFloat(null)}
      >
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-[12px]">
          <thead>
            <tr className="hairline-b text-left tracking-[0.14em] text-muted-foreground">
              <th className="px-8 py-4 font-normal">姓名</th>
              <th className="py-4 font-normal">单位</th>
              <th className="py-4 font-normal">现职称</th>
              {hasGroupVotes ? <th className="py-4 font-normal">学科组推荐票</th> : null}
              <th className="px-8 py-4 text-right font-normal">表决</th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.flatMap((c, idx) => {
              const prev = idx > 0 ? data.candidates[idx - 1] : null;
              const newGroup =
                showGroupHeaders && (prev?.group_id ?? null) !== (c.group_id ?? null);
              const groupHeader = newGroup ? (
                <tr key={`group-${c.group_id ?? "none"}-${idx}`} className="bg-muted/40">
                  <td
                    colSpan={hasGroupVotes ? 5 : 4}
                    className="px-8 py-2 text-[11px] tracking-[0.2em] text-muted-foreground"
                  >
                    {groupLabel(c.group_id)}
                  </td>
                </tr>
              ) : null;
              const row = (
              <tr key={c.id} className="hairline-b last:border-b-0">
                <td className="px-8 py-4 tracking-[0.1em]">{c.full_name}</td>
                <td className="py-4 text-muted-foreground">{c.unit ?? "—"}</td>
                <td className="py-4 text-muted-foreground">{c.current_title ?? "—"}</td>
                {hasGroupVotes ? (
                  <td className="py-4 tracking-[0.1em]">
                    {c.agree_votes ?? 0}
                    <span className="text-muted-foreground">
                      {c.total_votes ? ` / ${c.total_votes}` : ""}
                    </span>
                  </td>
                ) : null}
                <td className="px-8 py-3 text-right">
                  <Select
                     value={choices[c.id] ?? ""}
                     onValueChange={(v) => {
                       if (
                         v === "recommend" &&
                         choices[c.id] !== "recommend" &&
                         maxRecommend > 0 &&
                         recommendCount >= maxRecommend
                       ) {
                         setOverPick({
                           candidateId: c.id,
                           nextCount: recommendCount + 1,
                         });
                         return;
                       }
                       setChoices((p) => ({ ...p, [c.id]: v as Choice }));
                     }}
                   >
                    <SelectTrigger
                      className={`ml-auto h-9 w-32 rounded-none text-[12px] ${
                        choices[c.id] === "recommend"
                          ? "border-vote-recommend/40 bg-vote-recommend-bg text-vote-recommend data-[state=open]:border-vote-recommend/60"
                          : choices[c.id] === "not_recommend"
                            ? "border-vote-reject/40 bg-vote-reject-bg text-vote-reject data-[state=open]:border-vote-reject/60"
                            : ""
                      }`}
                    >
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="recommend">{labels.recommend}</SelectItem>
                      <SelectItem value="not_recommend">{labels.not_recommend}</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
              );
              return [groupHeader, row];
            })}
          </tbody>
          </table>
        </Panel>
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
          className="h-10 rounded-none px-10 text-[12px] tracking-[0.3em]"
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
