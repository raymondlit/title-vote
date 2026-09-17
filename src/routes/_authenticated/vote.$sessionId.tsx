import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, Panel } from "@/components/Shell";
import { useSession, useSchool } from "@/lib/session";
import { submitBallot } from "@/lib/vote.functions";
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

const CHOICE_LABEL: Record<Choice, string> = {
  recommend: "推荐",
  not_recommend: "不推荐",
  abstain: "弃权",
};

function VotePage() {
  const { sessionId } = Route.useParams();
  const { data: session } = useSession();
  const { data: school } = useSchool(session?.schoolId);
  const queryClient = useQueryClient();
  const submit = useServerFn(submitBallot);

  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["vote-session", sessionId, session?.userId],
    enabled: !!session?.userId,
    queryFn: async () => {
      const { data: judge } = await supabase
        .from("judges")
        .select("id, full_name, unit, title, school_id, group_id")
        .eq("profile_id", session!.userId)
        .maybeSingle();

      const { data: vs } = await supabase
        .from("vote_sessions")
        .select(
          "id, title, status, category_id, group_id, school_id, opened_at, closed_at, voter_scope",
        )
        .eq("id", sessionId)
        .maybeSingle();
      const outOfScope =
        !!vs?.group_id && vs.voter_scope !== "all" && vs.group_id !== judge?.group_id;
      if (!vs || !judge || vs.school_id !== judge.school_id || outOfScope)
        return { judge, vs: null, candidates: [], rule: null, ballot: null, items: [] };



      let cq = supabase
        .from("candidates")
        .select("id, full_name, unit, current_title")
        .eq("school_id", vs.school_id)
        .order("full_name");
      if (vs.category_id) cq = cq.eq("category_id", vs.category_id);
      if (vs.group_id) cq = cq.eq("group_id", vs.group_id);
      const { data: candidates } = await cq;

      const { data: rules } = await supabase
        .from("voting_rules")
        .select("category_id, group_id, total_count, max_recommend, allow_abstain, require_all")
        .eq("school_id", vs.school_id);
      const rule = pickVotingRule(rules, vs.category_id, vs.group_id);

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

      return { judge, vs, candidates: candidates ?? [], rule, ballot, items: items ?? [] };
    },
  });

  const recommendCount = useMemo(
    () => Object.values(choices).filter((c) => c === "recommend").length,
    [choices],
  );

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
  const maxRecommend = rule?.max_recommend ?? 0;
  const overLimit = maxRecommend > 0 && recommendCount > maxRecommend;
  const missing = data.candidates.filter((c) => !choices[c.id]).length;

  // 已提交：确认单
  if (data.ballot) {
    const map = new Map(data.items.map((i) => [i.candidate_id, i.choice as Choice]));
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
                    {map.get(c.id) ? CHOICE_LABEL[map.get(c.id)!] : "未表态"}
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
      toast.success("表决已提交");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <PageTitle
        title={data.vs.title}
        description={
          rule
            ? `参评 ${rule.total_count || data.candidates.length} 人，最多可推荐 ${maxRecommend} 人。${rule.allow_abstain ? "允许弃权。" : "不允许弃权。"}${rule.require_all ? "须对每人表态。" : ""}`
            : "请对以下评审对象逐一表态。"
        }
      />

      <Panel className="p-0">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="hairline-b text-left tracking-[0.14em] text-muted-foreground">
              <th className="px-8 py-4 font-normal">姓名</th>
              <th className="py-4 font-normal">单位</th>
              <th className="py-4 font-normal">现职称</th>
              <th className="px-8 py-4 text-right font-normal">表决</th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.map((c) => (
              <tr key={c.id} className="hairline-b last:border-b-0">
                <td className="px-8 py-4 tracking-[0.1em]">{c.full_name}</td>
                <td className="py-4 text-muted-foreground">{c.unit ?? "—"}</td>
                <td className="py-4 text-muted-foreground">{c.current_title ?? "—"}</td>
                <td className="px-8 py-3 text-right">
                  <Select
                    value={choices[c.id] ?? ""}
                    onValueChange={(v) => setChoices((p) => ({ ...p, [c.id]: v as Choice }))}
                  >
                    <SelectTrigger className="ml-auto h-9 w-32 rounded-none text-[12px]">
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="recommend">推荐</SelectItem>
                      <SelectItem value="not_recommend">不推荐</SelectItem>
                      {rule?.allow_abstain !== false ? (
                        <SelectItem value="abstain">弃权</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="mt-8 flex items-center justify-between">
        <div className="text-[12px] tracking-[0.14em]">
          <span className={overLimit ? "text-destructive" : "text-muted-foreground"}>
            已推荐 {recommendCount}
            {maxRecommend > 0 ? ` / ${maxRecommend}` : ""} 人
          </span>
          {missing > 0 ? (
            <span className="ml-6 text-muted-foreground">未表态 {missing} 人</span>
          ) : null}
        </div>
        <Button
          disabled={overLimit || saving || data.candidates.length === 0}
          onClick={() => {
            if (overLimit) {
              toast.error(`最多可推荐 ${maxRecommend} 人，请先调整`);
              return;
            }
            if (rule?.require_all && missing > 0) {
              toast.error("本场投票要求对每位评审对象表态");
              return;
            }
            setConfirmOpen(true);
          }}
          className="h-10 rounded-none px-10 text-[12px] tracking-[0.3em]"
        >
          提交表决
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[14px] tracking-[0.16em]">确认提交</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] leading-loose tracking-[0.1em]">
              本次共推荐 {recommendCount} 人
              {missing > 0 ? `，未表态 ${missing} 人` : ""}。提交后不可修改，是否确认？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-52 overflow-auto text-[12px] leading-loose">
            {data.candidates
              .filter((c) => choices[c.id] === "recommend")
              .map((c) => (
                <div key={c.id} className="tracking-[0.1em]">
                  推荐 · {c.full_name}
                </div>
              ))}
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
