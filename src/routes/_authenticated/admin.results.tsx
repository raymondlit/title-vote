import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Printer, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fetchRecommendedCandidateIds } from "@/lib/committee";
import { PageTitle, Panel } from "@/components/Shell";
import { useSession, useSchool } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_RESULT_SHEET_CONFIG,
  normalizeResultSheetConfig,
  ResultSheet,
  resultSheetHtml,
  type ResultSheetConfig,
  type ResultSheetRow,
} from "@/components/ResultSheet";
import { ResultSheetConfigEditor } from "@/components/ResultSheetConfigEditor";
import { ListSkeleton } from "@/components/DataState";
import { escapeHtml, openPrintWindow, printDocumentHtml } from "@/lib/print";
import { voteLabels } from "@/lib/voteLabels";
import {
  JudgeBallotSheet,
  JudgeBallotSheetPreview,
  judgeBallotSheetHtml,
  type JudgeSheetData,
  type JudgeSheetRow,
} from "@/components/JudgeBallotSheet";
import { JudgeSheetPrintEditor } from "@/components/JudgeSheetPrintEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/results")({
  head: () => ({
    meta: [
      { title: "投票结果与确认单配置" },
      { name: "description", content: "查看职称评审投票结果并配置全校统一确认单。" },
      { property: "og:title", content: "投票结果与确认单配置" },
      { property: "og:description", content: "查看职称评审投票结果并配置全校统一确认单。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const { data: session } = useSession();
  const { data: school } = useSchool(session?.schoolId);
  const schoolId = session?.schoolId ?? null;
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string>("");
  const [showConfig, setShowConfig] = useState(false);
  const [showPrintLayout, setShowPrintLayout] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [previewJudgeId, setPreviewJudgeId] = useState("");
  const [config, setConfig] = useState<ResultSheetConfig>(() =>
    structuredClone(DEFAULT_RESULT_SHEET_CONFIG),
  );

  useEffect(() => {
    if (school) setConfig(normalizeResultSheetConfig(school.result_sheet_config));
  }, [school]);

  const { data: sessions } = useQuery({
    queryKey: ["result-sessions", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("vote_sessions")
        .select("id, title, status, category_id, group_id, school_id, voter_scope")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const current = (sessions ?? []).find((s) => s.id === sessionId) ?? null;

  // 轻量轮询：只查本场已提交评委，页面不可见时自动暂停
  const { data: submittedIdsLive } = useQuery({
    queryKey: ["result-submitted", sessionId],
    enabled: !!current,
    refetchInterval: () => (document.visibilityState === "visible" ? 10000 : false),
    queryFn: async () => {
      const { data } = await supabase
        .from("ballots")
        .select("judge_id")
        .eq("session_id", current!.id);
      return (data ?? []).map((b) => b.judge_id).join(",");
    },
  });

  // 实时同步：评委提交表决后立即刷新，无需手动刷新页面
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`results-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ballots", filter: `session_id=eq.${sessionId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["result-submitted", sessionId] });
          queryClient.invalidateQueries({ queryKey: ["result"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "ballot_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["result"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient]);

  const { data: result, isLoading: resultLoading } = useQuery({
    queryKey: ["result", sessionId, submittedIdsLive ?? ""],
    enabled: !!current,
    queryFn: async () => {
      let cq = supabase
        .from("candidates")
        .select("id, full_name, unit, current_title, group_id")
        .eq("school_id", current!.school_id);
      if (current!.category_id) cq = cq.eq("category_id", current!.category_id);
      if (current!.group_id) cq = cq.eq("group_id", current!.group_id);

      const [
        { data: candidates },
        { data: ballots },
        { data: judges },
        { data: groups },
      ] = await Promise.all([
        cq,
        supabase
          .from("ballots")
          .select("id, judge_id, submitted_at")
          .eq("session_id", current!.id),
        supabase
          .from("judges")
          .select("id, full_name, unit, group_id, is_committee_member")
          .eq("school_id", current!.school_id)
          .order("full_name"),
        supabase.from("subject_groups").select("id, name").eq("school_id", current!.school_id),
      ]);

      const scopedCandidates =
        current!.voter_scope === "committee"
          ? await (async () => {
              const recommended = await fetchRecommendedCandidateIds(
                supabase,
                current!.school_id,
                current!.category_id,
              );
              return (candidates ?? []).filter((c) => recommended.has(c.id));
            })()
          : candidates ?? [];

      const eligibleJudges = (judges ?? []).filter((j) =>
        current!.voter_scope === "committee"
          ? !!(j as { is_committee_member?: boolean }).is_committee_member
          : !current!.group_id ||
            current!.voter_scope === "all" ||
            j.group_id === current!.group_id,
      );

      const ballotIds = (ballots ?? []).map((b) => b.id);
      const { data: items } = ballotIds.length
        ? await supabase
            .from("ballot_items")
            .select("ballot_id, candidate_id, choice")
            .in("ballot_id", ballotIds)
        : { data: [] as { ballot_id: string; candidate_id: string; choice: string }[] };

      const rows: ResultSheetRow[] = scopedCandidates.map((c) => ({
        id: c.id,
        name: c.full_name,
        unit: c.unit,
        title: c.current_title,
        recommend: 0,
        not_recommend: 0,
        abstain: 0,
      }));
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const it of items ?? []) {
        const r = byId.get(it.candidate_id);
        if (!r) continue;
        if (it.choice === "recommend") r.recommend += 1;
        else if (it.choice === "not_recommend") r.not_recommend += 1;
        else r.abstain += 1;
      }

      const choiceByBallot = new Map<string, Map<string, string>>();
      for (const it of items ?? []) {
        let m = choiceByBallot.get(it.ballot_id);
        if (!m) {
          m = new Map();
          choiceByBallot.set(it.ballot_id, m);
        }
        m.set(it.candidate_id, it.choice);
      }
      const judgeById = new Map(eligibleJudges.map((j) => [j.id, j]));
      const candidateOrder = scopedCandidates.map((c) => ({
        id: c.id,
        name: c.full_name,
        unit: c.unit,
        title: c.current_title,
      }));
      const sheets: JudgeSheetData[] = (ballots ?? [])
        .filter((b) => judgeById.has(b.judge_id))
        .map((b) => {
          const judge = judgeById.get(b.judge_id)!;
          const choices = choiceByBallot.get(b.id);
          return {
            judgeId: judge.id,
            judgeName: judge.full_name,
            judgeUnit: judge.unit,
            submittedAt: b.submitted_at,
            rows: candidateOrder.map((c) => ({
              id: c.id,
              name: c.name,
              unit: c.unit,
              title: c.title,
              choice: (choices?.get(c.id) as JudgeSheetRow["choice"]) ?? null,
            })),
          };
        })
        .sort((a, b) => a.judgeName.localeCompare(b.judgeName, "zh-Hans-CN"));

      const submittedIds = new Set((ballots ?? []).map((b) => b.judge_id));
      const pendingJudges = eligibleJudges.filter((j) => !submittedIds.has(j.id));

      rows.sort(
        (a, b) => b.recommend - a.recommend || a.name.localeCompare(b.name, "zh-Hans-CN"),
      );

      const groupNameById = new Map((groups ?? []).map((g) => [g.id as string, g.name as string]));
      const groupOfCandidate = new Map(
        scopedCandidates.map((c) => [c.id, (c as { group_id?: string | null }).group_id ?? null]),
      );
      const summary = rows.map((r, index) => ({
        rank: index + 1,
        name: r.name,
        group: groupNameById.get(groupOfCandidate.get(r.id) ?? "") ?? "—",
        recommend: r.recommend,
      }));

      return {
        rows,
        summary,
        submitted: sheets.length,
        judgeCount: eligibleJudges.length,
        sheets,
        pendingJudges,
      };
    },
  });

  async function saveConfig() {
    if (!schoolId) return;
    if (!config.columns.some((column) => column.visible)) {
      toast.error("请至少显示一个结果字段");
      return;
    }
    if (
      (config.judgeSheet.footerText.trim() || config.judgeSheet.showPageNumber) &&
      config.judgeSheet.signatureBottom < 12
    ) {
      toast.error("签字线距页面底部至少需 12 毫米，以免与页脚或页码重叠");
      return;
    }
    setSavingConfig(true);
    const { error } = await supabase
      .from("schools")
      .update({ result_sheet_config: JSON.parse(JSON.stringify(config)) })
      .eq("id", schoolId);
    setSavingConfig(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["school", schoolId] });
    toast.success("全校确认单模板已保存");
  }

  function exportWord() {
    if (!current || !result) return;
    const html = resultSheetHtml({
      config,
      schoolName: school?.name ?? "",
      sessionTitle: current.title,
      judgeCount: result.judgeCount,
      submitted: result.submitted,
      rows: result.rows,
    });
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${current?.title ?? "投票结果"}-确认单.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printJudgeSheets(sheets: JudgeSheetData[]) {
    if (!current || sheets.length === 0) return;
    const html = judgeBallotSheetHtml(
      school?.name ?? "",
      current.title,
      sheets,
      voteLabels(school),
      config.judgeSheet,
    );
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast.error("浏览器阻止了打印窗口，请允许弹出窗口后重试");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  function printSummaryTable() {
    if (!current || !result) return;
    const labels = voteLabels(school);
    const rowsHtml = result.summary
      .map(
        (r) =>
          `<tr><td>${r.rank}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.group)}</td><td>${r.recommend}</td></tr>`,
      )
      .join("");
    const body = `<h1>${escapeHtml(school?.name ?? "")}</h1>
<p class="sub">${escapeHtml(current.title)} · 投票结果总表（按${escapeHtml(labels.recommend)}票数从高到低排序）</p>
<table><thead><tr><th style="width:64px">序号</th><th>姓名</th><th>学科</th><th style="width:120px">${escapeHtml(labels.recommend)}票数</th></tr></thead><tbody>${rowsHtml}</tbody></table>
<p class="foot">应到评委 ${result.judgeCount} 人 · 已提交 ${result.submitted} 人<br />打印日期：${new Date().toLocaleDateString("zh-CN")} &nbsp;&nbsp;&nbsp; 签字：________________</p>`;
    if (!openPrintWindow(printDocumentHtml({ title: `${current.title} 投票结果总表`, body }))) {
      toast.error("浏览器阻止了打印窗口，请允许弹出窗口后重试");
    }
  }

  const chartData = (result?.rows ?? []).map((r) => ({ name: r.name, 推荐: r.recommend }));
  const previewSheet =
    result?.sheets.find((sheet) => sheet.judgeId === previewJudgeId) ?? result?.sheets[0] ?? null;

  return (
    <>
      <div className="no-print">
        <PageTitle
          title="投票结果"
          description="查看得票情况，并配置全校统一使用的结果确认单。"
        />
        <Panel className="mb-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger className="w-full rounded-none sm:w-80">
                <SelectValue placeholder="选择投票场次" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                {(sessions ?? []).length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12px] leading-6 text-muted-foreground">
                    暂无投票场次
                    <br />
                    请先在「投票场次」页创建
                  </div>
                ) : (
                  (sessions ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              onClick={() => setShowConfig((open) => !open)}
            >
              <Settings2 /> {showConfig ? "收起确认单配置" : "配置确认单"}
            </Button>
          </div>
        </Panel>

        {showConfig ? (
          <Panel className="mb-10">
            <ResultSheetConfigEditor
              value={config}
              onChange={setConfig}
              onSave={saveConfig}
              saving={savingConfig}
            />
          </Panel>
        ) : null}
      </div>

      {current && !result && resultLoading ? (
        <Panel>
          <ListSkeleton rows={6} />
        </Panel>
      ) : null}

      {current && result ? (
        <>
          <div className="no-print mb-10 grid gap-6 lg:grid-cols-[1fr_280px]">
            <Panel>
              <div className="mb-8 text-[12px] tracking-[0.16em] text-muted-foreground">
                应到评委 {result.judgeCount} 人 · 已提交 {result.submitted} 人 · 未提交{" "}
                {result.pendingJudges.length} 人
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -20 }}>
                    <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip cursor={{ fill: "transparent" }} />
                    <Bar dataKey="推荐" fill="currentColor" className="text-primary" barSize={22}>
                      {chartData.map((d) => (
                        <Cell key={d.name} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-12">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-[12px] tracking-[0.16em]">
                    本组投票结果总表（按{voteLabels(school).recommend}票数从高到低）
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="no-print rounded-none"
                    onClick={printSummaryTable}
                  >
                    <Printer /> 打印总表
                  </Button>
                </div>
                <table className="mt-6 w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-muted/50 tracking-[0.1em]">
                      <th className="w-16 border border-border px-3 py-2 font-normal">序号</th>
                      <th className="border border-border px-3 py-2 text-left font-normal">姓名</th>
                      <th className="border border-border px-3 py-2 text-left font-normal">学科</th>
                      <th className="w-32 border border-border px-3 py-2 font-normal">
                        {voteLabels(school).recommend}票数
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.summary.map((r) => (
                      <tr key={r.rank}>
                        <td className="border border-border px-3 py-2 text-center text-muted-foreground">
                          {r.rank}
                        </td>
                        <td className="border border-border px-3 py-2 tracking-[0.06em]">
                          {r.name}
                        </td>
                        <td className="border border-border px-3 py-2 text-muted-foreground">
                          {r.group}
                        </td>
                        <td className="border border-border px-3 py-2 text-center">{r.recommend}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel>
              <div className="text-[12px] tracking-[0.16em]">提交情况（每 10 秒自动刷新）</div>
              <div className="mt-6 text-[11px] tracking-[0.14em] text-muted-foreground">
                未提交 {result.pendingJudges.length} 人
              </div>
              <ul className="mt-3 space-y-2 text-[12px]">
                {result.pendingJudges.length === 0 ? (
                  <li className="text-muted-foreground">全部评委已提交</li>
                ) : (
                  result.pendingJudges.map((judge) => (
                    <li key={judge.id} className="hairline-b pb-2 tracking-[0.1em]">
                      {judge.full_name}
                      {judge.unit ? (
                        <span className="ml-2 text-muted-foreground">{judge.unit}</span>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
              <div className="mt-8 text-[11px] tracking-[0.14em] text-muted-foreground">
                已提交 {result.sheets.length} 人
              </div>
              <ul className="mt-3 space-y-2 text-[12px] text-muted-foreground">
                {result.sheets.map((sheet) => (
                  <li key={sheet.judgeId} className="tracking-[0.1em]">
                    {sheet.judgeName}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="no-print mb-12">
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-[12px] tracking-[0.16em]">
                  评委投票情况确认单（{result.sheets.length} 份）
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <Button type="button" variant="outline" className="rounded-none" onClick={() => setShowPrintLayout((open) => !open)}>
                    <Eye /> {showPrintLayout ? "收起打印预览" : "打印版式设置与预览"}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-none"
                    disabled={result.sheets.length === 0}
                    onClick={() => printJudgeSheets(result.sheets)}
                  >
                    <Printer /> 打印全部评委确认单
                  </Button>
                </div>
              </div>
              {showPrintLayout && previewSheet ? (
                <div className="mt-8 grid gap-8 border-t pt-8 xl:grid-cols-[minmax(320px,0.8fr)_minmax(480px,1.2fr)]">
                  <div>
                    <JudgeSheetPrintEditor
                      value={config.judgeSheet}
                      onChange={(judgeSheet) => setConfig((currentConfig) => ({ ...currentConfig, judgeSheet }))}
                      onSave={saveConfig}
                      saving={savingConfig}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <div className="text-[12px] tracking-[0.16em]">最终打印效果</div>
                        <p className="mt-2 text-[10px] text-muted-foreground">预览与打印使用相同的每页人数、页眉、页脚及签字线设置。</p>
                      </div>
                      <Select value={previewSheet.judgeId} onValueChange={setPreviewJudgeId}>
                        <SelectTrigger className="w-48 rounded-none" aria-label="选择预览评委"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-none">
                          {result.sheets.map((sheet) => <SelectItem key={sheet.judgeId} value={sheet.judgeId}>{sheet.judgeName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <JudgeBallotSheetPreview
                      schoolName={school?.name ?? ""}
                      sessionTitle={current.title}
                      data={previewSheet}
                      labels={voteLabels(school)}
                      config={config.judgeSheet}
                    />
                  </div>
                </div>
              ) : null}
              {result.sheets.length === 0 ? (
                <p className="mt-6 text-[12px] text-muted-foreground">暂无评委提交。</p>
              ) : (
                <div className="mt-8 space-y-8">
                  {result.sheets.map((sheet) => (
                    <div key={sheet.judgeId}>
                      <JudgeBallotSheet
                        schoolName={school?.name ?? ""}
                        sessionTitle={current.title}
                        data={sheet}
                        labels={voteLabels(school)}
                      />
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          className="rounded-none"
                          onClick={() => printJudgeSheets([sheet])}
                        >
                          <Printer /> 打印本人确认单
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>


          <ResultSheet
            config={config}
            schoolName={school?.name ?? ""}
            sessionTitle={current.title}
            judgeCount={result.judgeCount}
            submitted={result.submitted}
            rows={result.rows}
          />

          <div className="no-print mt-8 flex flex-wrap gap-4">
            <Button
              onClick={() => window.print()}
              className="h-10 rounded-none px-8 text-[12px] tracking-[0.2em]"
            >
              <Printer /> 打印 / 存为 PDF
            </Button>
            <Button
              variant="outline"
              onClick={exportWord}
              className="h-10 rounded-none px-8 text-[12px] tracking-[0.2em]"
            >
              <Download /> 导出 Word
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
