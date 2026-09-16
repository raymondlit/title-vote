import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Printer, Settings2 } from "lucide-react";
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
  const [savingConfig, setSavingConfig] = useState(false);
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
        .select("id, title, status, category_id, group_id, school_id")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const current = (sessions ?? []).find((s) => s.id === sessionId) ?? null;

  const { data: result } = useQuery({
    queryKey: ["result", sessionId],
    enabled: !!current,
    queryFn: async () => {
      let cq = supabase
        .from("candidates")
        .select("id, full_name, unit, current_title")
        .eq("school_id", current!.school_id);
      if (current!.category_id) cq = cq.eq("category_id", current!.category_id);
      if (current!.group_id) cq = cq.eq("group_id", current!.group_id);

      const [{ data: candidates }, { data: ballots }] = await Promise.all([
        cq,
        supabase.from("ballots").select("id, judge_id").eq("session_id", current!.id),
      ]);

      const ballotIds = (ballots ?? []).map((b) => b.id);
      const { data: items } = ballotIds.length
        ? await supabase
            .from("ballot_items")
            .select("candidate_id, choice")
            .in("ballot_id", ballotIds)
        : { data: [] as { candidate_id: string; choice: string }[] };

      const rows: ResultSheetRow[] = (candidates ?? []).map((c) => ({
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
      rows.sort((a, b) => b.recommend - a.recommend);

      const { count: judgeCount } = await supabase
        .from("judges")
        .select("id", { count: "exact", head: true })
        .eq("school_id", current!.school_id);

      return { rows, submitted: ballotIds.length, judgeCount: judgeCount ?? 0 };
    },
  });

  async function saveConfig() {
    if (!schoolId) return;
    if (!config.columns.some((column) => column.visible)) {
      toast.error("请至少显示一个结果字段");
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

  const chartData = (result?.rows ?? []).map((r) => ({ name: r.name, 推荐: r.recommend }));

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
                {(sessions ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
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

      {current && result ? (
        <>
          <div className="no-print mb-10">
            <Panel>
              <div className="mb-8 text-[12px] tracking-[0.16em] text-muted-foreground">
                应到评委 {result.judgeCount} 人 · 已提交 {result.submitted} 人
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
