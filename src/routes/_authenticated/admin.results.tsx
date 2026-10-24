import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Download, Eye, Printer, Settings2 } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import { useServerFn } from "@tanstack/react-start";
import { deleteVoteArchive } from "@/lib/admin.functions";

type ArchiveSnapshot = {
  schoolName: string;
  labels: { recommend: string; not_recommend: string };
  judgeCount: number;
  submitted: number;
  categoryName?: string | undefined;
  groupName?: string | undefined;
  summary: { rank: number; name: string; group: string; recommend: number }[];
  sheets: {
    judgeName: string;
    judgeUnit: string | null;
    submittedAt: string | null;
    rows: { name: string; choice: string | null }[];
  }[];
};

type ArchiveRow = {
  id: string;
  title: string;
  snapshot: unknown;
  created_at: string;
  school_id: string | null;
  category_id: string | null;
  group_id: string | null;
};
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
import { effectiveRoundRule, fetchAllBallotItems, hasFixedPool } from "@/lib/rounds";
import { pickVotingRule } from "@/lib/voteRules";
import { RoundPanel } from "@/components/RoundPanel";
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
  const [archiving, setArchiving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const deleteArchiveFn = useServerFn(deleteVoteArchive);
  const [archiveDelete, setArchiveDelete] = useState<{ id: string; title: string } | null>(null);
  const { data: archives } = useQuery({
    queryKey: ["vote-archives", schoolId ?? "all"],
    enabled: !!schoolId || !!session?.isSuper,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vote_archives")
        .select("id, title, snapshot, created_at, school_id, category_id, group_id")
        .order("created_at", { ascending: false })
        .returns<ArchiveRow[]>();
      if (error) throw error;
      const rows = data ?? [];
      return schoolId ? rows.filter((a) => a.school_id === schoolId) : rows;
    },
  });

  // 归档筛选所需名称：高校、评审类别、学科组
  const { data: scopeNames } = useQuery({
    queryKey: ["archive-scope-names", schoolId ?? "all"],
    enabled: !!schoolId || !!session?.isSuper,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [cats, grps, schools] = await Promise.all([
        schoolId
          ? supabase.from("review_categories").select("id, name").eq("school_id", schoolId)
          : supabase.from("review_categories").select("id, name"),
        schoolId
          ? supabase.from("subject_groups").select("id, name").eq("school_id", schoolId)
          : supabase.from("subject_groups").select("id, name"),
        supabase.from("schools").select("id, name"),
      ]);
      return {
        categoryNames: new Map(
          (cats.data ?? []).map((c) => [c.id as string, c.name as string]),
        ),
        groupNames: new Map((grps.data ?? []).map((g) => [g.id as string, g.name as string])),
        schoolNames: new Map((schools.data ?? []).map((s) => [s.id as string, s.name as string])),
      };
    },
  });

  const [filterSchool, setFilterSchool] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const archiveRows = useMemo(() => {
    return (archives ?? []).map((a) => {
      const snap = a.snapshot as ArchiveSnapshot | null;
      return {
        ...a,
        snap,
        schoolName:
          (a.school_id ? scopeNames?.schoolNames.get(a.school_id) : null) ??
          snap?.schoolName ??
          "—",
        categoryName:
          (a.category_id ? scopeNames?.categoryNames.get(a.category_id) : null) ??
          snap?.categoryName ??
          null,
        groupName:
          (a.group_id ? scopeNames?.groupNames.get(a.group_id) : null) ?? snap?.groupName ?? null,
      };
    });
  }, [archives, scopeNames]);

  const filterOptions = useMemo(() => {
    const schools = new Map<string, string>();
    const cats = new Map<string, string>();
    const grps = new Map<string, string>();
    for (const a of archiveRows) {
      if (a.school_id) schools.set(a.school_id, a.schoolName);
      if (a.category_id) cats.set(a.category_id, a.categoryName ?? "未知类别");
      if (a.group_id) grps.set(a.group_id, a.groupName ?? "未知学科组");
    }
    const sortByName = (m: Map<string, string>) =>
      [...m.entries()].sort((x, y) => x[1].localeCompare(y[1], "zh-Hans-CN"));
    return { schools: sortByName(schools), categories: sortByName(cats), groups: sortByName(grps) };
  }, [archiveRows]);

  const filteredArchives = useMemo(
    () =>
      archiveRows.filter((a) => {
        if (filterSchool && a.school_id !== filterSchool) return false;
        if (filterCategory && a.category_id !== filterCategory) return false;
        if (filterGroup && a.group_id !== filterGroup) return false;
        const day = a.created_at.slice(0, 10);
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
        return true;
      }),
    [archiveRows, filterSchool, filterCategory, filterGroup, dateFrom, dateTo],
  );

  const hasArchiveFilter = !!(
    filterSchool ||
    filterCategory ||
    filterGroup ||
    dateFrom ||
    dateTo
  );
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
        .select(
          "id, title, status, category_id, group_id, school_id, voter_scope, round_number, parent_session_id, candidate_ids, passed_candidate_ids, max_recommend",
        )
        .eq("school_id", schoolId!)
        .is("archived_at", null)
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
      const fixedPool = hasFixedPool(current!);
      let cq = supabase
        .from("candidates")
        .select("id, full_name, unit, current_title, group_id")
        .eq("school_id", current!.school_id);
      if (fixedPool) {
        cq = cq.in("id", current!.candidate_ids ?? []);
      } else {
        if (current!.category_id) cq = cq.eq("category_id", current!.category_id);
        if (current!.group_id) cq = cq.eq("group_id", current!.group_id);
      }

      const [
        { data: candidates },
        { data: ballots },
        { data: judges },
        { data: groups },
        { data: rules },
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
        supabase
          .from("voting_rules")
          .select("category_id, group_id, total_count, max_recommend, allow_abstain, require_all")
          .eq("school_id", current!.school_id),
      ]);

      const scopedCandidates =
        !fixedPool && current!.voter_scope === "committee"
          ? await (async () => {
              const recommended = await fetchRecommendedCandidateIds(
                supabase,
                current!.school_id,
                current!.category_id,
              );
              return (candidates ?? []).filter((c) => recommended.has(c.id));
            })()
          : candidates ?? [];
      const rule = effectiveRoundRule(
        pickVotingRule(rules, current!.category_id, current!.group_id),
        current!,
        scopedCandidates.length,
      );

      const eligibleJudges = (judges ?? []).filter((j) =>
        current!.voter_scope === "committee"
          ? !!(j as { is_committee_member?: boolean }).is_committee_member
          : !current!.group_id ||
            current!.voter_scope === "all" ||
            j.group_id === current!.group_id,
      );

      const ballotIds = (ballots ?? []).map((b) => b.id);
      const items = await fetchAllBallotItems(supabase, ballotIds);

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
        quota: rule?.max_recommend ?? 0,
        poolIds: scopedCandidates.map((c) => c.id),
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

  async function archiveCurrent() {
    if (!current || !result || !schoolId) return;
    const labels = voteLabels(school);
    let categoryName: string | undefined;
    let groupName: string | undefined;
    if (current.category_id) {
      const { data } = await supabase
        .from("review_categories")
        .select("name")
        .eq("id", current.category_id)
        .maybeSingle();
      categoryName = data?.name ?? undefined;
    }
    if (current.group_id) {
      const { data } = await supabase
        .from("subject_groups")
        .select("name")
        .eq("id", current.group_id)
        .maybeSingle();
      groupName = data?.name ?? undefined;
    }
    const snapshot: ArchiveSnapshot = {
      schoolName: school?.name ?? "",
      labels,
      judgeCount: result.judgeCount,
      submitted: result.submitted,
      categoryName,
      groupName,
      summary: result.summary,
      sheets: result.sheets.map((s) => ({
        judgeName: s.judgeName,
        judgeUnit: s.judgeUnit ?? null,
        submittedAt: s.submittedAt,
        rows: s.rows.map((r) => ({ name: r.name, choice: r.choice })),
      })),
    };
    setArchiving(true);
    const { error } = await supabase.from("vote_archives").insert({
      school_id: schoolId,
      session_id: current.id,
      title: current.title,
      category_id: current.category_id,
      group_id: current.group_id,
      snapshot: snapshot as never,
      archived_by: session?.userId ?? null,
    });
    setArchiving(false);
    if (error) {
      toast.error("归档失败：" + error.message);
      return;
    }
    toast.success("已归档，可在页面底部「归档记录」随时查看");
    queryClient.invalidateQueries({ queryKey: ["vote-archives", schoolId ?? "all"] });
  }

  function removeArchive(id: string, title: string) {
    setArchiveDelete({ id, title });
  }

  async function confirmRemoveArchive(password: string) {
    if (!archiveDelete) return;
    await deleteArchiveFn({ data: { archiveId: archiveDelete.id, password } });
    toast.success(`已删除「${archiveDelete.title}」的归档记录`);
    setArchiveDelete(null);
    queryClient.invalidateQueries({ queryKey: ["vote-archives", schoolId ?? "all"] });
  }

  function printArchive(title: string, snap: ArchiveSnapshot) {
    const L = snap.labels ?? { recommend: "推荐", not_recommend: "不推荐" };
    const label = (c: string | null) =>
      c === "recommend" ? L.recommend : c === "not_recommend" ? L.not_recommend : c === "abstain" ? "弃权" : "—";
    const summary = snap.summary
      .map((r) => `<tr><td>${r.rank}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.group)}</td><td>${r.recommend}</td></tr>`)
      .join("");
    const sheets = snap.sheets
      .map(
        (s) => `<div style="page-break-before:always"><h2>评委个人投票确认单 · ${escapeHtml(s.judgeName)}</h2>
<p class="sub">${escapeHtml(s.judgeUnit ?? "")} · 提交时间 ${escapeHtml(s.submittedAt ? new Date(s.submittedAt).toLocaleString("zh-CN") : "—")}</p>
<table><thead><tr><th style="width:64px">序号</th><th>姓名</th><th>表决</th></tr></thead><tbody>${s.rows
          .map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(label(r.choice))}</td></tr>`)
          .join("")}</tbody></table><p class="foot">评委签字：________________ &nbsp;&nbsp; 日期：____________</p></div>`,
      )
      .join("");
    const body = `<h1>${escapeHtml(snap.schoolName)}</h1>
<p class="sub">${escapeHtml(title)} · 归档投票结果（应到评委 ${snap.judgeCount} 人 · 已提交 ${snap.submitted} 人）</p>
<table><thead><tr><th style="width:64px">序号</th><th>姓名</th><th>学科</th><th style="width:120px">${escapeHtml(L.recommend)}票数</th></tr></thead><tbody>${summary}</tbody></table>
<p class="foot">主任委员签字：________________ &nbsp;&nbsp; 委员签字：________________________________</p>${sheets}`;
    if (!openPrintWindow(printDocumentHtml({ title: `${title} 归档`, body }))) {
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

          <RoundPanel
            current={current}
            sessions={sessions ?? []}
            rows={result.rows}
            poolIds={result.poolIds}
            quota={result.quota}
            schoolName={school?.name ?? ""}
            recommendLabel={voteLabels(school).recommend}
            onCreated={(id) => setSessionId(id)}
          />

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
            <Button
              variant="outline"
              onClick={archiveCurrent}
              disabled={archiving || current.status !== "closed"}
              title={current.status !== "closed" ? "请先在「投票场次」页结束本场后再归档" : undefined}
              className="h-10 rounded-none px-8 text-[12px] tracking-[0.2em]"
            >
              <Archive /> {current.status === "closed" ? "归档本场结果" : "结束场次后可归档"}
            </Button>
          </div>
        </>
      ) : null}

      <div className="no-print mt-12">
        <Panel>
          <div className="mb-6 text-[12px] tracking-[0.16em]">归档记录</div>
          {(archives ?? []).length === 0 ? (
            <p className="text-[12px] text-muted-foreground">暂无归档。场次结束后，在结果页点「归档本场结果」即可永久保存。</p>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-[10px] tracking-[0.16em] text-muted-foreground">高校</label>
                  <Select value={filterSchool} onValueChange={setFilterSchool}>
                    <SelectTrigger className="w-48 rounded-none">
                      <SelectValue placeholder="全部高校" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {filterOptions.schools.map(([id, name]) => (
                        <SelectItem key={id} value={id}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] tracking-[0.16em] text-muted-foreground">评审类别</label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="w-44 rounded-none">
                      <SelectValue placeholder="全部类别" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {filterOptions.categories.map(([id, name]) => (
                        <SelectItem key={id} value={id}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] tracking-[0.16em] text-muted-foreground">学科组</label>
                  <Select value={filterGroup} onValueChange={setFilterGroup}>
                    <SelectTrigger className="w-44 rounded-none">
                      <SelectValue placeholder="全部学科组" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {filterOptions.groups.map(([id, name]) => (
                        <SelectItem key={id} value={id}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] tracking-[0.16em] text-muted-foreground">归档时间从</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 rounded-none border border-input bg-transparent px-3 text-[12px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] tracking-[0.16em] text-muted-foreground">至</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 rounded-none border border-input bg-transparent px-3 text-[12px]"
                  />
                </div>
                {hasArchiveFilter ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-none"
                    onClick={() => {
                      setFilterSchool("");
                      setFilterCategory("");
                      setFilterGroup("");
                      setDateFrom("");
                      setDateTo("");
                    }}
                  >
                    清除筛选
                  </Button>
                ) : null}
                <div className="ml-auto text-[11px] tracking-[0.1em] text-muted-foreground">
                  共 {filteredArchives.length} 条
                  {hasArchiveFilter ? ` / ${archiveRows.length} 条` : ""}
                </div>
              </div>
              {filteredArchives.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">没有符合筛选条件的归档记录，请调整筛选条件。</p>
              ) : (
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="border border-border px-3 py-2 text-left font-normal">场次</th>
                      <th className="border border-border px-3 py-2 text-left font-normal">高校</th>
                      <th className="border border-border px-3 py-2 text-left font-normal">评审类别</th>
                      <th className="border border-border px-3 py-2 text-left font-normal">学科组</th>
                      <th className="border border-border px-3 py-2 text-left font-normal">归档时间</th>
                      <th className="border border-border px-3 py-2 font-normal">评委提交</th>
                      <th className="w-56 border border-border px-3 py-2 font-normal">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArchives.map((a) => (
                      <tr key={a.id}>
                        <td className="border border-border px-3 py-2">{a.title}</td>
                        <td className="border border-border px-3 py-2 text-muted-foreground">{a.schoolName}</td>
                        <td className="border border-border px-3 py-2 text-muted-foreground">{a.categoryName ?? "—"}</td>
                        <td className="border border-border px-3 py-2 text-muted-foreground">{a.groupName ?? "—"}</td>
                        <td className="border border-border px-3 py-2">{new Date(a.created_at).toLocaleString("zh-CN")}</td>
                        <td className="border border-border px-3 py-2 text-center">{a.snap?.submitted ?? "—"}/{a.snap?.judgeCount ?? "—"}</td>
                        <td className="border border-border px-3 py-2 text-center">
                          <Button size="sm" variant="outline" className="mr-2 rounded-none" onClick={() => printArchive(a.title, a.snap!)}>
                            <Printer /> 查看/打印
                          </Button>
                          <Button size="sm" variant="ghost" className="rounded-none text-destructive" onClick={() => removeArchive(a.id, a.title)}>
                            删除
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </Panel>
      </div>
      {confirmDialog}
      <PasswordConfirmDialog
        open={!!archiveDelete}
        onOpenChange={(o) => {
          if (!o) setArchiveDelete(null);
        }}
        title="永久删除投票结果归档"
        subject={archiveDelete?.title}
        onConfirm={confirmRemoveArchive}
        archiveHint="归档记录是本场投票结果（总表与每位评委确认单）的长期存档，建议保留以备复核。如只是不想看到原场次，请到「投票场次」把场次归档，可随时从归档区取回。"
      >
        <p className="text-destructive">
          删除后该场次的结果总表与评委个人确认单存档将永久清除，无法恢复。
        </p>
      </PasswordConfirmDialog>
    </>
  );
}
