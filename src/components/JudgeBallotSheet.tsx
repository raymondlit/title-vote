import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEFAULT_VOTE_LABELS, type VoteLabels } from "@/lib/voteLabels";

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

export type JudgeSheetPrintConfig = {
  headerText: string;
  footerText: string;
  showSchool: boolean;
  showSession: boolean;
  showJudge: boolean;
  showSubmittedAt: boolean;
  repeatPageHeading: boolean;
  showPageNumber: boolean;
  signatureMode: "last_page" | "every_page";
  signatureAlign: "left" | "center" | "right";
  signatureWidth: number;
  signatureBottom: number;
  rowsPerPage: number;
  repeatTableHeader: boolean;
};

export const DEFAULT_JUDGE_SHEET_PRINT_CONFIG: JudgeSheetPrintConfig = {
  headerText: "",
  footerText: "",
  showSchool: true,
  showSession: true,
  showJudge: true,
  showSubmittedAt: true,
  repeatPageHeading: true,
  showPageNumber: true,
  signatureMode: "last_page",
  signatureAlign: "left",
  signatureWidth: 58,
  signatureBottom: 12,
  rowsPerPage: 22,
  repeatTableHeader: true,
};

export function normalizeJudgeSheetPrintConfig(value: unknown): JudgeSheetPrintConfig {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Partial<JudgeSheetPrintConfig>)
    : {};
  const numberInRange = (candidate: unknown, fallback: number, min: number, max: number) =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.min(max, Math.max(min, Math.round(candidate)))
      : fallback;
  return {
    headerText: typeof raw.headerText === "string" ? raw.headerText : "",
    footerText: typeof raw.footerText === "string" ? raw.footerText : "",
    showSchool: raw.showSchool !== false,
    showSession: raw.showSession !== false,
    showJudge: raw.showJudge !== false,
    showSubmittedAt: raw.showSubmittedAt !== false,
    repeatPageHeading: raw.repeatPageHeading !== false,
    showPageNumber: raw.showPageNumber !== false,
    signatureMode: raw.signatureMode === "every_page" ? "every_page" : "last_page",
    signatureAlign:
      raw.signatureAlign === "center" || raw.signatureAlign === "right" ? raw.signatureAlign : "left",
    signatureWidth: numberInRange(raw.signatureWidth, 58, 30, 90),
    signatureBottom: numberInRange(raw.signatureBottom, 12, 6, 36),
    rowsPerPage: numberInRange(raw.rowsPerPage, 22, 8, 28),
    repeatTableHeader: raw.repeatTableHeader !== false,
  };
}

export const CHOICE_LABEL: Record<string, string> = {
  recommend: "推荐",
  not_recommend: "不推荐",
  abstain: "弃权",
};

export function choiceText(
  choice: JudgeSheetRow["choice"],
  labels: VoteLabels = DEFAULT_VOTE_LABELS,
): string {
  return (choice ? labels[choice] : undefined) ?? "—";
}

function totalsText(
  counts: { recommend: number; not_recommend: number; abstain: number },
  labels: VoteLabels,
) {
  const parts = [
    `${labels.recommend} ${counts.recommend} 人`,
    `${labels.not_recommend} ${counts.not_recommend} 人`,
  ];
  if (counts.abstain > 0) parts.push(`${labels.abstain} ${counts.abstain} 人`);
  return `合计：${parts.join(" · ")}`;
}

export function formatTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function judgeSheetTokens(
  text: string,
  schoolName: string,
  sessionTitle: string,
  data: JudgeSheetData,
  page: number,
  pageCount: number,
) {
  return text
    .replaceAll("{{school}}", schoolName)
    .replaceAll("{{session}}", sessionTitle)
    .replaceAll("{{judge}}", data.judgeName)
    .replaceAll("{{unit}}", data.judgeUnit ?? "")
    .replaceAll("{{submittedAt}}", formatTime(data.submittedAt))
    .replaceAll("{{page}}", String(page))
    .replaceAll("{{pages}}", String(pageCount));
}

export function paginateJudgeSheet(data: JudgeSheetData, config: JudgeSheetPrintConfig) {
  const rowsPerPage = Math.min(28, Math.max(8, config.rowsPerPage));
  return Array.from(
    { length: Math.max(1, Math.ceil(data.rows.length / rowsPerPage)) },
    (_, pageIndex) => ({
      rows: data.rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage),
      offset: pageIndex * rowsPerPage,
      page: pageIndex + 1,
    }),
  );
}

type Props = {
  schoolName: string;
  sessionTitle: string;
  data: JudgeSheetData;
  labels?: VoteLabels;
};

export function JudgeBallotSheet({
  schoolName,
  sessionTitle,
  data,
  labels = DEFAULT_VOTE_LABELS,
}: Props) {
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
        {totalsText(counts, labels)}
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

type PreviewProps = Props & {
  config: JudgeSheetPrintConfig;
};

export function JudgeBallotSheetPreview({
  schoolName,
  sessionTitle,
  data,
  labels = DEFAULT_VOTE_LABELS,
  config,
}: PreviewProps) {
  const pages = useMemo(() => paginateJudgeSheet(data, config), [data, config]);
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => setPageIndex(0), [data.judgeId, config.rowsPerPage]);
  const activeIndex = Math.min(pageIndex, pages.length - 1);
  const active = pages[activeIndex];
  if (!active) return null;
  const showHeading = activeIndex === 0 || config.repeatPageHeading;
  const showSignature = config.signatureMode === "every_page" || activeIndex === pages.length - 1;
  const counts = data.rows.reduce(
    (acc, row) => {
      if (row.choice) acc[row.choice] += 1;
      return acc;
    },
    { recommend: 0, not_recommend: 0, abstain: 0 },
  );
  const alignClass =
    config.signatureAlign === "center"
      ? "justify-center"
      : config.signatureAlign === "right"
        ? "justify-end"
        : "justify-start";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[11px] tracking-[0.12em] text-muted-foreground">
          A4 预览 · 第 {activeIndex + 1} / {pages.length} 页
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="icon" disabled={activeIndex === 0} onClick={() => setPageIndex((page) => Math.max(0, page - 1))} title="上一页">
            <ChevronLeft />
          </Button>
          <Button type="button" variant="outline" size="icon" disabled={activeIndex === pages.length - 1} onClick={() => setPageIndex((page) => Math.min(pages.length - 1, page + 1))} title="下一页">
            <ChevronRight />
          </Button>
        </div>
      </div>
      <article className="relative mx-auto aspect-[210/297] w-full max-w-[620px] overflow-hidden border bg-card p-[6%] text-[10px] shadow-sm">
        {config.headerText ? (
          <div className="mb-3 border-b pb-2 text-center text-[9px] text-muted-foreground">
            {judgeSheetTokens(config.headerText, schoolName, sessionTitle, data, active.page, pages.length)}
          </div>
        ) : null}
        {showHeading ? (
          <header className="mb-4 text-center">
            {config.showSchool ? <div className="text-[13px] tracking-[0.16em]">{schoolName}</div> : null}
            {config.showSession ? <h3 className="mt-1 text-[11px] tracking-[0.12em]">{sessionTitle} 评委投票情况确认单</h3> : null}
            {config.showJudge || config.showSubmittedAt ? (
              <p className="mt-2 text-[9px] text-muted-foreground">
                {config.showJudge ? `评委：${data.judgeName}${data.judgeUnit ? ` · ${data.judgeUnit}` : ""}` : ""}
                {config.showJudge && config.showSubmittedAt ? " · " : ""}
                {config.showSubmittedAt ? `提交时间：${formatTime(data.submittedAt)}` : ""}
              </p>
            ) : null}
          </header>
        ) : null}
        <table className="w-full border-collapse text-[9px]">
          {config.repeatTableHeader || activeIndex === 0 ? (
            <thead><tr>{["序号", "姓名", "单位", "现职称", "本人表决"].map((label) => <th key={label} className="border px-1 py-1 text-left font-normal">{label}</th>)}</tr></thead>
          ) : null}
          <tbody>
            {active.rows.map((row, index) => (
              <tr key={row.id}>
                <td className="border px-1 py-1">{active.offset + index + 1}</td>
                <td className="border px-1 py-1">{row.name}</td>
                <td className="border px-1 py-1">{row.unit ?? "—"}</td>
                <td className="border px-1 py-1">{row.title ?? "—"}</td>
                <td className="border px-1 py-1">{choiceText(row.choice, labels)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {activeIndex === pages.length - 1 ? <p className="mt-3 text-center text-[9px] text-muted-foreground">{totalsText(counts, labels)}</p> : null}
        {showSignature ? (
          <div
            className={cn("absolute left-[6%] right-[6%] flex", alignClass)}
            style={{ bottom: `${config.signatureBottom + 7}%` }}
          >
            <div className="flex items-end gap-1 whitespace-nowrap" style={{ width: `${config.signatureWidth}%` }}>
              <span>评委本人签字：</span><span className="h-4 min-w-0 flex-1 border-b" />
              <span>日期：</span><span className="h-4 w-16 border-b" />
            </div>
          </div>
        ) : null}
        <footer className="absolute bottom-[3%] left-[6%] right-[6%] flex items-center justify-between border-t pt-2 text-[8px] text-muted-foreground">
          <span>{judgeSheetTokens(config.footerText, schoolName, sessionTitle, data, active.page, pages.length)}</span>
          {config.showPageNumber ? <span className="ml-auto">第 {active.page} 页 / 共 {pages.length} 页</span> : null}
        </footer>
      </article>
    </div>
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
  labels: VoteLabels = DEFAULT_VOTE_LABELS,
  inputConfig: JudgeSheetPrintConfig = DEFAULT_JUDGE_SHEET_PRINT_CONFIG,
) {
  const config = normalizeJudgeSheetPrintConfig(inputConfig);
  const body = sheets
    .map((data) => {
      const counts = data.rows.reduce(
        (acc, row) => {
          if (row.choice) acc[row.choice] += 1;
          return acc;
        },
        { recommend: 0, not_recommend: 0, abstain: 0 },
      );
      const renderRows = (rows: JudgeSheetRow[], offset = 0) =>
        rows
          .map(
            (row, index) =>
              `<tr><td>${offset + index + 1}</td><td>${esc(row.name)}</td><td>${esc(row.unit ?? "—")}</td><td>${esc(row.title ?? "—")}</td><td>${esc(choiceText(row.choice, labels))}</td></tr>`,
          )
          .join("");
      const heading = (page: number, pageCount: number, show: boolean) => {
        const custom = config.headerText
          ? `<div class="custom-header">${esc(judgeSheetTokens(config.headerText, schoolName, sessionTitle, data, page, pageCount))}</div>`
          : "";
        if (!show) return custom;
        const school = config.showSchool ? `<h2>${esc(schoolName)}</h2>` : "";
        const title = config.showSession ? `<h3>${esc(sessionTitle)} 评委投票情况确认单</h3>` : "";
        const metaParts = [
          config.showJudge ? `评委：${esc(data.judgeName)}${data.judgeUnit ? ` · ${esc(data.judgeUnit)}` : ""}` : "",
          config.showSubmittedAt ? `提交时间：${esc(formatTime(data.submittedAt))}` : "",
        ].filter(Boolean);
        return `${custom}${school}${title}${metaParts.length ? `<p class="meta">${metaParts.join(" · ")}</p>` : ""}`;
      };
      const table = (rows: JudgeSheetRow[], offset: number, showHeader: boolean) =>
        `<table>${showHeader ? "<thead><tr><th>序号</th><th>姓名</th><th>单位</th><th>现职称</th><th>本人表决</th></tr></thead>" : ""}<tbody>${renderRows(rows, offset)}</tbody></table>`;
      const summary = `<p class="meta totals">${esc(totalsText(counts, labels))}</p>`;
      const signature = `<div class="sign">评委本人签字：<span class="line"></span> 日期：<span class="line short"></span></div>`;
      const pages = paginateJudgeSheet(data, config);
      return pages
        .map(
          (pageData, pageIndex) => {
            const showSignature = config.signatureMode === "every_page" || pageIndex === pages.length - 1;
            const footerText = judgeSheetTokens(config.footerText, schoolName, sessionTitle, data, pageData.page, pages.length);
            const pageNumber = config.showPageNumber ? `第 ${pageData.page} 页 / 共 ${pages.length} 页` : "";
            return `<section class="sheet signed-page">${heading(pageData.page, pages.length, pageIndex === 0 || config.repeatPageHeading)}${table(pageData.rows, pageData.offset, pageIndex === 0 || config.repeatTableHeader)}${pageIndex === pages.length - 1 ? summary : ""}${showSignature ? signature : ""}<footer><span>${esc(footerText)}</span><span>${esc(pageNumber)}</span></footer></section>`;
          },
        )
        .join("");
    })
    .join("");

  const align = config.signatureAlign === "center" ? "center" : config.signatureAlign === "right" ? "flex-end" : "flex-start";
  return `<html><head><meta charset="utf-8"><title>评委投票情况确认单</title><style>@page{size:A4 portrait;margin:14mm}body{margin:0;font-family:SimSun,serif;font-size:12px;color:#30302d}h2,h3{text-align:center;font-weight:normal;letter-spacing:2px;margin:4px 0}.meta{text-align:center;color:#666}.custom-header{text-align:center;border-bottom:1px solid #aaa;padding-bottom:7px;margin-bottom:10px;color:#666;white-space:pre-wrap}table{border-collapse:collapse;width:100%;margin-top:16px}thead{display:table-header-group}th,td{border:1px solid #888;padding:6px;text-align:left}th{font-weight:normal}.sheet{page-break-after:always}.sheet:last-child{page-break-after:auto}.sign{position:absolute;left:0;right:0;bottom:${config.signatureBottom}mm;display:flex;justify-content:${align};align-items:flex-end;gap:8px;white-space:nowrap;width:${config.signatureWidth}%;${config.signatureAlign === "center" ? "margin-left:auto;margin-right:auto" : config.signatureAlign === "right" ? "margin-left:auto" : ""}}.line{display:inline-block;border-bottom:1px solid #555;flex:1;height:16px}.line.short{width:80px;flex:none}.signed-page{position:relative;box-sizing:border-box;height:269mm;overflow:hidden}.signed-page .totals{margin-bottom:0}.signed-page footer{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;gap:16px;border-top:1px solid #aaa;padding-top:7px;color:#666;font-size:10px}.signed-page footer span:last-child{margin-left:auto;white-space:nowrap}</style></head><body>${body}</body></html>`;
}
