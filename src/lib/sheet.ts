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
};

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

export const JUDGE_TEMPLATE_ROWS: string[][] = [
  ["姓名", "工号", "单位", "职称", "电话"],
  ["张三", "20230001", "机械工程学院", "教授", "13800000000"],
  ["李四", "20230002", "外国语学院", "副教授", "13900000000"],
];

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
