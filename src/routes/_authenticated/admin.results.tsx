import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/results")({
  component: ResultsPage,
});

type Row = {
  id: string;
  name: string;
  unit: string | null;
  title: string | null;
  recommend: number;
  not_recommend: number;
  abstain: number;
};

function ResultsPage() {
  const { data: session } = useSession();
  const { data: school } = useSchool(session?.schoolId);
  const schoolId = session?.schoolId ?? null;
  const [sessionId, setSessionId] = useState<string>("");

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

      const rows: Row[] = (candidates ?? []).map((c) => ({
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

  function sheetHtml() {
    const rows = (result?.rows ?? [])
      .map(
        (r, i) =>
          `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.unit ?? ""}</td><td>${r.title ?? ""}</td><td>${r.recommend}</td><td>${r.not_recommend}</td><td>${r.abstain}</td></tr>`,
      )
      .join("");
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${current?.title ?? ""}</title></head>
<body style="font-family:SimSun,serif;">
<h2 style="text-align:center;font-weight:normal;">${school?.name ?? ""}</h2>
<h3 style="text-align:center;font-weight:normal;">${current?.title ?? ""} 投票结果确认单</h3>
<p>应到评委 ${result?.judgeCount ?? 0} 人，实际提交 ${result?.submitted ?? 0} 人。</p>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px;">
<tr><th>序号</th><th>姓名</th><th>单位</th><th>现职称</th><th>推荐</th><th>不推荐</th><th>弃权</th></tr>
${rows}
</table>
<p style="margin-top:60px;">主任委员签字：______________　　　日期：__________</p>
<p style="margin-top:30px;">监票人签字：______________　　　日期：__________</p>
</body></html>`;
  }

  function exportWord() {
    const blob = new Blob(["\ufeff", sheetHtml()], { type: "application/msword" });
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
          description="查看各评审对象得票情况，导出带签字位的确认单。"
        />
        <Panel className="mb-10">
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger className="w-80 rounded-none">
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
        </Panel>
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

          <div className="print-area border bg-card p-10">
            <div className="mb-8 text-center">
              <div className="text-[15px] tracking-[0.2em]">{school?.name ?? ""}</div>
              <div className="mt-3 text-[13px] tracking-[0.16em]">{current.title} 投票结果确认单</div>
              <div className="mt-3 text-[11px] tracking-[0.16em] text-muted-foreground">
                应到评委 {result.judgeCount} 人，实际提交 {result.submitted} 人
              </div>
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="hairline-b text-left tracking-[0.14em] text-muted-foreground">
                  <th className="py-3 font-normal">序号</th>
                  <th className="py-3 font-normal">姓名</th>
                  <th className="py-3 font-normal">单位</th>
                  <th className="py-3 font-normal">现职称</th>
                  <th className="py-3 font-normal">推荐</th>
                  <th className="py-3 font-normal">不推荐</th>
                  <th className="py-3 font-normal">弃权</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={r.id} className="hairline-b">
                    <td className="py-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-3 tracking-[0.1em]">{r.name}</td>
                    <td className="py-3 text-muted-foreground">{r.unit ?? "—"}</td>
                    <td className="py-3 text-muted-foreground">{r.title ?? "—"}</td>
                    <td className="py-3">{r.recommend}</td>
                    <td className="py-3">{r.not_recommend}</td>
                    <td className="py-3">{r.abstain}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-16 space-y-10 text-[12px] tracking-[0.16em]">
              <div>
                主任委员签字：
                <span className="ml-2 inline-block w-48 border-b border-foreground/60" />
                <span className="ml-10">日期：</span>
                <span className="ml-2 inline-block w-32 border-b border-foreground/60" />
              </div>
              <div>
                监票人签字：
                <span className="ml-2 inline-block w-48 border-b border-foreground/60" />
                <span className="ml-10">日期：</span>
                <span className="ml-2 inline-block w-32 border-b border-foreground/60" />
              </div>
            </div>
          </div>

          <div className="no-print mt-8 flex gap-4">
            <Button
              onClick={() => window.print()}
              className="h-10 rounded-none px-8 text-[12px] tracking-[0.2em]"
            >
              打印 / 存为 PDF
            </Button>
            <button
              onClick={exportWord}
              className="h-10 border px-8 text-[12px] tracking-[0.2em] text-muted-foreground hover:text-foreground"
            >
              导出 Word
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
