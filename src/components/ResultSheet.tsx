import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ResultColumnKey =
  | "index"
  | "name"
  | "unit"
  | "title"
  | "recommend"
  | "not_recommend"
  | "abstain";

export type ResultSheetColumn = {
  key: ResultColumnKey;
  label: string;
  visible: boolean;
};

export type ResultSheetSignature = {
  id: string;
  label: string;
  lines: number;
  showDate: boolean;
};

export type ResultSheetConfig = {
  version: 1;
  schoolTitle: string;
  documentTitle: string;
  summaryTemplate: string;
  description: string;
  columns: ResultSheetColumn[];
  signatures: ResultSheetSignature[];
  orientation: "portrait" | "landscape";
  fontSize: "small" | "medium" | "large";
  density: "compact" | "comfortable";
  footer: string;
};

export type ResultSheetRow = {
  id: string;
  name: string;
  unit: string | null;
  title: string | null;
  recommend: number;
  not_recommend: number;
  abstain: number;
};

export const DEFAULT_RESULT_SHEET_CONFIG: ResultSheetConfig = {
  version: 1,
  schoolTitle: "{{school}}",
  documentTitle: "{{session}} 投票结果确认单",
  summaryTemplate: "应到评委 {{judgeCount}} 人，实际提交 {{submitted}} 人。",
  description: "",
  columns: [
    { key: "index", label: "序号", visible: true },
    { key: "name", label: "姓名", visible: true },
    { key: "unit", label: "单位", visible: true },
    { key: "title", label: "现职称", visible: true },
    { key: "recommend", label: "推荐", visible: true },
    { key: "not_recommend", label: "不推荐", visible: true },
    { key: "abstain", label: "弃权", visible: true },
  ],
  signatures: [
    { id: "chair", label: "主任委员签字", lines: 1, showDate: true },
    { id: "members", label: "其他委员签字", lines: 3, showDate: false },
    { id: "supervisor", label: "监票人签字", lines: 1, showDate: true },
  ],
  orientation: "portrait",
  fontSize: "medium",
  density: "comfortable",
  footer: "",
};

const COLUMN_KEYS = new Set(DEFAULT_RESULT_SHEET_CONFIG.columns.map((column) => column.key));

export function normalizeResultSheetConfig(value: unknown): ResultSheetConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return structuredClone(DEFAULT_RESULT_SHEET_CONFIG);
  }
  const raw = value as Partial<ResultSheetConfig>;
  const suppliedColumns = Array.isArray(raw.columns)
    ? raw.columns.filter(
        (column): column is ResultSheetColumn =>
          !!column &&
          typeof column === "object" &&
          COLUMN_KEYS.has(column.key) &&
          typeof column.label === "string" &&
          typeof column.visible === "boolean",
      )
    : [];
  const used = new Set(suppliedColumns.map((column) => column.key));
  const columns = [
    ...suppliedColumns,
    ...DEFAULT_RESULT_SHEET_CONFIG.columns.filter((column) => !used.has(column.key)),
  ];
  const signatures = Array.isArray(raw.signatures)
    ? raw.signatures
        .filter(
          (signature): signature is ResultSheetSignature =>
            !!signature &&
            typeof signature === "object" &&
            typeof signature.id === "string" &&
            typeof signature.label === "string" &&
            typeof signature.lines === "number" &&
            typeof signature.showDate === "boolean",
        )
        .map((signature) => ({ ...signature, lines: Math.min(6, Math.max(1, signature.lines)) }))
    : DEFAULT_RESULT_SHEET_CONFIG.signatures;

  return {
    version: 1,
    schoolTitle: typeof raw.schoolTitle === "string" ? raw.schoolTitle : DEFAULT_RESULT_SHEET_CONFIG.schoolTitle,
    documentTitle:
      typeof raw.documentTitle === "string" ? raw.documentTitle : DEFAULT_RESULT_SHEET_CONFIG.documentTitle,
    summaryTemplate:
      typeof raw.summaryTemplate === "string"
        ? raw.summaryTemplate
        : DEFAULT_RESULT_SHEET_CONFIG.summaryTemplate,
    description: typeof raw.description === "string" ? raw.description : "",
    columns,
    signatures,
    orientation: raw.orientation === "landscape" ? "landscape" : "portrait",
    fontSize: raw.fontSize === "small" || raw.fontSize === "large" ? raw.fontSize : "medium",
    density: raw.density === "compact" ? "compact" : "comfortable",
    footer: typeof raw.footer === "string" ? raw.footer : "",
  };
}

export function applyResultSheetTokens(
  text: string,
  values: { school: string; session: string; judgeCount: number; submitted: number },
) {
  return text
    .replaceAll("{{school}}", values.school)
    .replaceAll("{{session}}", values.session)
    .replaceAll("{{judgeCount}}", String(values.judgeCount))
    .replaceAll("{{submitted}}", String(values.submitted));
}

export function resultCell(row: ResultSheetRow, index: number, key: ResultColumnKey): ReactNode {
  if (key === "index") return index + 1;
  if (key === "name") return row.name;
  if (key === "unit") return row.unit ?? "—";
  if (key === "title") return row.title ?? "—";
  return row[key];
}

type ResultSheetProps = {
  config: ResultSheetConfig;
  schoolName: string;
  sessionTitle: string;
  judgeCount: number;
  submitted: number;
  rows: ResultSheetRow[];
};

export function ResultSheet({
  config,
  schoolName,
  sessionTitle,
  judgeCount,
  submitted,
  rows,
}: ResultSheetProps) {
  const tokens = { school: schoolName, session: sessionTitle, judgeCount, submitted };
  const columns = config.columns.filter((column) => column.visible);
  const textSize = config.fontSize === "small" ? "text-[11px]" : config.fontSize === "large" ? "text-[14px]" : "text-[12px]";
  const cellSpace = config.density === "compact" ? "py-2" : "py-3";

  return (
    <article
      className={cn(
        "result-sheet print-area mx-auto border bg-card p-6 sm:p-10",
        config.orientation === "landscape" ? "max-w-6xl" : "max-w-4xl",
        textSize,
      )}
    >
      <style>{`@media print { @page { size: A4 ${config.orientation}; margin: 14mm; } }`}</style>
      <header className="mb-8 text-center">
        <div className="text-[15px] tracking-[0.2em]">
          {applyResultSheetTokens(config.schoolTitle, tokens)}
        </div>
        <h2 className="mt-3 text-[13px] tracking-[0.16em]">
          {applyResultSheetTokens(config.documentTitle, tokens)}
        </h2>
        {config.summaryTemplate ? (
          <p className="mt-3 text-[11px] tracking-[0.16em] text-muted-foreground">
            {applyResultSheetTokens(config.summaryTemplate, tokens)}
          </p>
        ) : null}
        {config.description ? (
          <p className="mt-4 whitespace-pre-wrap text-left leading-7 text-muted-foreground">
            {applyResultSheetTokens(config.description, tokens)}
          </p>
        ) : null}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px]">
          <thead>
            <tr className="hairline-b text-left tracking-[0.14em] text-muted-foreground">
              {columns.map((column) => (
                <th key={column.key} className={cn(cellSpace, "font-normal")}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="hairline-b">
                {columns.map((column) => (
                  <td key={column.key} className={cn(cellSpace, column.key === "name" ? "tracking-[0.1em]" : "text-muted-foreground")}>
                    {resultCell(row, index, column.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-14 space-y-9 tracking-[0.12em]">
        {config.signatures.map((signature) => (
          <div key={signature.id} className="break-inside-avoid">
            {Array.from({ length: signature.lines }, (_, index) => (
              <div key={index} className={cn("flex items-end gap-2", index > 0 && "mt-7")}>
                <span className={cn("shrink-0", index > 0 && "invisible")}>{signature.label}：</span>
                <span className="h-6 min-w-0 flex-1 border-b border-foreground/60" />
                {signature.showDate && index === 0 ? (
                  <>
                    <span className="ml-4 shrink-0">日期：</span>
                    <span className="h-6 w-28 shrink-0 border-b border-foreground/60" />
                  </>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </section>

      {config.footer ? (
        <footer className="mt-12 border-t pt-4 text-center text-[10px] leading-6 text-muted-foreground">
          {applyResultSheetTokens(config.footer, tokens)}
        </footer>
      ) : null}
    </article>
  );
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function resultSheetHtml(props: ResultSheetProps) {
  const { config, schoolName, sessionTitle, judgeCount, submitted, rows } = props;
  const tokens = { school: schoolName, session: sessionTitle, judgeCount, submitted };
  const columns = config.columns.filter((column) => column.visible);
  const fontSize = config.fontSize === "small" ? 10 : config.fontSize === "large" ? 13 : 11;
  const padding = config.density === "compact" ? 5 : 8;
  const rowHtml = rows
    .map(
      (row, index) =>
        `<tr>${columns.map((column) => `<td>${escapeHtml(String(resultCell(row, index, column.key) ?? ""))}</td>`).join("")}</tr>`,
    )
    .join("");
  const signatureHtml = config.signatures
    .map((signature) => {
      const lines = Array.from({ length: signature.lines }, (_, index) => {
        const label = index === 0 ? `${escapeHtml(signature.label)}：` : "&nbsp;";
        const date = signature.showDate && index === 0 ? '<span class="date">日期：________________</span>' : "";
        return `<div class="signature-line"><span class="label">${label}</span><span class="line"></span>${date}</div>`;
      }).join("");
      return `<div class="signature-block">${lines}</div>`;
    })
    .join("");

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escapeHtml(applyResultSheetTokens(config.documentTitle, tokens))}</title><style>@page{size:A4 ${config.orientation};margin:14mm}body{font-family:SimSun,serif;font-size:${fontSize}px;color:#30302d}h2,h3{text-align:center;font-weight:normal;letter-spacing:2px}p{line-height:1.8}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #888;padding:${padding}px;text-align:left}th{font-weight:normal}.description{white-space:pre-wrap}.signatures{margin-top:48px}.signature-block{margin-top:28px;page-break-inside:avoid}.signature-line{display:flex;align-items:flex-end;margin-top:22px}.label{display:inline-block;width:110px}.line{display:inline-block;border-bottom:1px solid #555;min-width:300px;width:60%;height:20px}.date{margin-left:24px}.footer{border-top:1px solid #aaa;margin-top:42px;padding-top:12px;text-align:center;color:#666}</style></head><body><h2>${escapeHtml(applyResultSheetTokens(config.schoolTitle, tokens))}</h2><h3>${escapeHtml(applyResultSheetTokens(config.documentTitle, tokens))}</h3>${config.summaryTemplate ? `<p style="text-align:center">${escapeHtml(applyResultSheetTokens(config.summaryTemplate, tokens))}</p>` : ""}${config.description ? `<p class="description">${escapeHtml(applyResultSheetTokens(config.description, tokens))}</p>` : ""}<table><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>${rowHtml}</table><div class="signatures">${signatureHtml}</div>${config.footer ? `<div class="footer">${escapeHtml(applyResultSheetTokens(config.footer, tokens))}</div>` : ""}</body></html>`;
}