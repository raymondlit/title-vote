export type JudgeSheetRow = {
  id: string;
  name: string;
  unit: string | null;
  title: string | null;
  choice: "recommend" | "not_recommend" | "abstain" | null;
};

export type JudgeSheetData = {
  judgeId: string;
  judgeName: string;
  judgeUnit: string | null;
  submittedAt: string | null;
  rows: JudgeSheetRow[];
};

export const CHOICE_LABEL: Record<string, string> = {
  recommend: "推荐",
  not_recommend: "不推荐",
  abstain: "弃权",
};

export function choiceText(choice: JudgeSheetRow["choice"]): string {
  return (choice ? CHOICE_LABEL[choice] : undefined) ?? "—";
}

export function formatTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Props = {
  schoolName: string;
  sessionTitle: string;
  data: JudgeSheetData;
};

export function JudgeBallotSheet({ schoolName, sessionTitle, data }: Props) {
  const counts = data.rows.reduce(
    (acc, row) => {
      if (row.choice) acc[row.choice] += 1;
      return acc;
    },
    { recommend: 0, not_recommend: 0, abstain: 0 },
  );

  return (
    <article className="border bg-card p-6 text-[12px] sm:p-8">
      <header className="mb-6 text-center">
        <div className="text-[14px] tracking-[0.2em]">{schoolName}</div>
        <h3 className="mt-2 text-[12px] tracking-[0.16em]">{sessionTitle} 评委投票情况确认单</h3>
        <p className="mt-3 text-[11px] tracking-[0.14em] text-muted-foreground">
          评委：{data.judgeName}
          {data.judgeUnit ? ` · ${data.judgeUnit}` : ""} · 提交时间：{formatTime(data.submittedAt)}
        </p>
      </header>

      <table className="w-full">
        <thead>
          <tr className="hairline-b text-left tracking-[0.14em] text-muted-foreground">
            <th className="py-2 font-normal">序号</th>
            <th className="py-2 font-normal">姓名</th>
            <th className="py-2 font-normal">单位</th>
            <th className="py-2 font-normal">现职称</th>
            <th className="py-2 font-normal">本人表决</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            <tr key={row.id} className="hairline-b">
              <td className="py-2 text-muted-foreground">{index + 1}</td>
              <td className="py-2 tracking-[0.1em]">{row.name}</td>
              <td className="py-2 text-muted-foreground">{row.unit ?? "—"}</td>
              <td className="py-2 text-muted-foreground">{row.title ?? "—"}</td>
              <td className="py-2">{choiceText(row.choice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-6 text-[11px] tracking-[0.14em] text-muted-foreground">
        合计：推荐 {counts.recommend} 人 · 不推荐 {counts.not_recommend} 人 · 弃权 {counts.abstain} 人
      </p>

      <div className="mt-10 flex items-end gap-2 tracking-[0.12em]">
        <span className="shrink-0">评委本人签字：</span>
        <span className="h-6 min-w-0 flex-1 border-b border-foreground/60" />
        <span className="ml-4 shrink-0">日期：</span>
        <span className="h-6 w-28 shrink-0 border-b border-foreground/60" />
      </div>
    </article>
  );
}

function esc(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function judgeBallotSheetHtml(
  schoolName: string,
  sessionTitle: string,
  sheets: JudgeSheetData[],
) {
  const body = sheets
    .map((data) => {
      const counts = data.rows.reduce(
        (acc, row) => {
          if (row.choice) acc[row.choice] += 1;
          return acc;
        },
        { recommend: 0, not_recommend: 0, abstain: 0 },
      );
      const rows = data.rows
        .map(
          (row, index) =>
            `<tr><td>${index + 1}</td><td>${esc(row.name)}</td><td>${esc(row.unit ?? "—")}</td><td>${esc(row.title ?? "—")}</td><td>${esc(choiceText(row.choice))}</td></tr>`,
        )
        .join("");
      return `<section class="sheet"><h2>${esc(schoolName)}</h2><h3>${esc(sessionTitle)} 评委投票情况确认单</h3><p class="meta">评委：${esc(data.judgeName)}${data.judgeUnit ? ` · ${esc(data.judgeUnit)}` : ""} · 提交时间：${esc(formatTime(data.submittedAt))}</p><table><tr><th>序号</th><th>姓名</th><th>单位</th><th>现职称</th><th>本人表决</th></tr>${rows}</table><p class="meta">合计：推荐 ${counts.recommend} 人 · 不推荐 ${counts.not_recommend} 人 · 弃权 ${counts.abstain} 人</p><div class="sign">评委本人签字：<span class="line"></span> 日期：<span class="line short"></span></div></section>`;
    })
    .join("");

  return `<html><head><meta charset="utf-8"><title>评委投票情况确认单</title><style>@page{size:A4 portrait;margin:14mm}body{font-family:SimSun,serif;font-size:12px;color:#30302d}h2,h3{text-align:center;font-weight:normal;letter-spacing:2px;margin:4px 0}.meta{text-align:center;color:#666}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #888;padding:6px;text-align:left}th{font-weight:normal}.sheet{page-break-after:always}.sheet:last-child{page-break-after:auto}.sign{margin-top:48px}.line{display:inline-block;border-bottom:1px solid #555;width:220px;height:16px}.line.short{width:120px}</style></head><body>${body}</body></html>`;
}
