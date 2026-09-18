import * as XLSX from "xlsx";

export type SheetRow = Record<string, string>;

const HEADER_MAP: Record<string, string> = {
  姓名: "full_name",
  名字: "full_name",
  工号: "staff_no",
  职工号: "staff_no",
  编号: "staff_no",
  单位: "unit",
  部门: "unit",
  学院: "unit",
  职称: "title",
  现职称: "current_title",
  现有职称: "current_title",
  电话: "phone",
  手机: "phone",
  联系电话: "phone",
  类别: "category",
  评审类别: "category",
  学科: "group",
  学科组: "group",
  学科小组: "group",
  备注: "notes",
  是否推荐: "is_recommended",
  推荐结论: "is_recommended",
  同意票数: "agree_votes",
  赞成票数: "agree_votes",
  总票数: "total_votes",
  应到票数: "total_votes",
};

/** 学科组线下推荐表：可勾选的信息栏目 */
export const GROUP_SHEET_FIELDS: TemplateField[] = [
  { key: "full_name", label: "姓名", required: true, sample: ["", ""] },
  { key: "unit", label: "单位", sample: ["", ""] },
  { key: "current_title", label: "现职称", sample: ["", ""] },
  { key: "category", label: "评审类别", sample: ["", ""] },
  { key: "group", label: "学科小组", sample: ["", ""] },
  { key: "notes", label: "备注", sample: ["", ""] },
];

export const GROUP_SHEET_DEFAULT_KEYS = ["full_name", "unit", "current_title"];

/** 线下填写栏（固定追加，用于回传录入） */
export const GROUP_SHEET_RESULT_COLUMNS = ["是否推荐", "同意票数", "总票数"];

export async function parseSheet(file: File): Promise<SheetRow[]> {
  const isCsv = /\.csv$/i.test(file.name);
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return raw.map((row) => {
    const out: SheetRow = {};
    for (const [key, value] of Object.entries(row)) {
      const clean = String(key).trim();
      const mapped = HEADER_MAP[clean] ?? clean;
      out[mapped] = String(value ?? "").trim();
    }
    return out;
  });
}

export function downloadXlsx(filename: string, rows: string[][], sheetName = "Sheet1") {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export type TemplateField = {
  key: string;
  label: string;
  required?: boolean;
  sample: [string, string];
};

/** 基础框架字段：管理员可勾选启用，姓名为必填不可取消 */
export const JUDGE_TEMPLATE_FIELDS: TemplateField[] = [
  { key: "full_name", label: "姓名", required: true, sample: ["张三", "李四"] },
  { key: "staff_no", label: "工号", sample: ["20230001", "20230002"] },
  { key: "unit", label: "单位", sample: ["机械工程学院", "外国语学院"] },
  { key: "title", label: "职称", sample: ["教授", "副教授"] },
  { key: "phone", label: "电话", sample: ["13800000000", "13900000000"] },
  { key: "notes", label: "备注", sample: ["", ""] },
];

export const DEFAULT_TEMPLATE_KEYS = ["full_name", "staff_no", "unit", "title", "phone"];

/** 参评人员（评审对象）名单基础框架 */
export const CANDIDATE_TEMPLATE_FIELDS: TemplateField[] = [
  { key: "full_name", label: "姓名", required: true, sample: ["张三", "李四"] },
  { key: "unit", label: "单位", sample: ["机械工程学院", "外国语学院"] },
  { key: "current_title", label: "现职称", sample: ["讲师", "副教授"] },
  { key: "category", label: "评审类别", sample: ["教授", "副教授"] },
  { key: "group", label: "学科小组", sample: ["工科组", "文科组"] },
  { key: "staff_no", label: "工号", sample: ["20230001", "20230002"] },
  { key: "notes", label: "备注", sample: ["", ""] },
];

export const CANDIDATE_DEFAULT_KEYS = [
  "full_name",
  "unit",
  "current_title",
  "category",
  "group",
];

export function buildTemplateRows(labels: string[], samples: string[][]): string[][] {
  return [labels, ...samples];
}

export function templateRowsFor(
  fields: { label: string; sample?: [string, string] }[],
): string[][] {
  const header = fields.map((f) => f.label);
  const r1 = fields.map((f) => f.sample?.[0] ?? "");
  const r2 = fields.map((f) => f.sample?.[1] ?? "");
  return [header, r1, r2];
}

export const JUDGE_TEMPLATE_ROWS: string[][] = templateRowsFor(
  JUDGE_TEMPLATE_FIELDS.filter((f) => DEFAULT_TEMPLATE_KEYS.includes(f.key)),
);

export function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
