/**
 * 评委端名单预览 PDF：按评委端顺序列出评审对象，多学科组时插入组标题。
 * 用浏览器系统字体绘制到画布再嵌入 PDF，中文正常显示。
 */
import { A4, MARGIN, FOOTER_H, downloadBlob } from "@/lib/passwordBookPdf";

export { downloadBlob };

export type ListLine =
  | { kind: "group"; label: string }
  | {
      kind: "row";
      no: number;
      name: string;
      unit: string;
      title: string;
      votes: string;
    };

export const TITLE_H = 22; // 首页标题区（mm）
export const COLHEAD_H = 8; // 每页表头
export const ROW_H = 7;
export const GROUP_H = 10;

const lineH = (l: ListLine) => (l.kind === "group" ? GROUP_H : ROW_H);

/** 分页：首页留标题区；组标题不会孤零零落在页底 */
export function paginateLines(lines: ListLine[]): ListLine[][] {
  const usable = A4.h - MARGIN * 2 - FOOTER_H - COLHEAD_H;
  const pages: ListLine[][] = [];
  let cur: ListLine[] = [];
  let used = 0;
  let cap = usable - TITLE_H;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const need = lineH(l) + (l.kind === "group" ? ROW_H : 0); // 组标题至少带一行
    if (cur.length > 0 && used + need > cap) {
      pages.push(cur);
      cur = [];
      used = 0;
      cap = usable;
    }
    cur.push(l);
    used += lineH(l);
  }
  pages.push(cur);
  return pages;
}

const FONT = `"Noto Sans SC","PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif`;
const PX = 200 / 25.4;

function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

function drawPage(
  lines: ListLine[],
  opts: { title: string; subtitle: string; first: boolean; pageNo: number; pageCount: number },
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(A4.w * PX);
  canvas.height = Math.round(A4.h * PX);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(PX, PX);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4.w, A4.h);
  const left = MARGIN;
  const right = A4.w - MARGIN;
  let y = MARGIN;

  if (opts.first) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#2b2b2b";
    ctx.font = `400 5.2px ${FONT}`;
    ctx.fillText(opts.title, A4.w / 2, y + 6);
    ctx.fillStyle = "#777";
    ctx.font = `400 3px ${FONT}`;
    ctx.fillText(opts.subtitle, A4.w / 2, y + 12);
    ctx.textAlign = "left";
    y += TITLE_H;
  }

  const cols = { no: left, name: left + 12, unit: left + 44, title: left + 118, votes: right };
  const hr = (yy: number, color = "#d8d6d0") => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(right, yy);
    ctx.stroke();
  };

  ctx.fillStyle = "#888";
  ctx.font = `400 2.8px ${FONT}`;
  ctx.fillText("序号", cols.no, y + 5);
  ctx.fillText("姓名", cols.name, y + 5);
  ctx.fillText("单位", cols.unit, y + 5);
  ctx.fillText("现职称", cols.title, y + 5);
  ctx.textAlign = "right";
  ctx.fillText("学科组推荐", cols.votes, y + 5);
  ctx.textAlign = "left";
  hr(y + COLHEAD_H, "#555");
  y += COLHEAD_H;

  for (const l of lines) {
    if (l.kind === "group") {
      ctx.fillStyle = "#555";
      ctx.font = `500 3.4px ${FONT}`;
      ctx.fillText(l.label, left, y + 7);
      hr(y + GROUP_H, "#999");
      y += GROUP_H;
      continue;
    }
    const base = y + 4.8;
    ctx.fillStyle = "#999";
    ctx.font = `400 3.2px ${FONT}`;
    ctx.fillText(String(l.no), cols.no, base);
    ctx.fillStyle = "#1f1f1f";
    ctx.font = `400 3.4px ${FONT}`;
    ctx.fillText(clip(ctx, l.name, 30), cols.name, base);
    ctx.fillStyle = "#555";
    ctx.font = `400 3.2px ${FONT}`;
    ctx.fillText(clip(ctx, l.unit, 70), cols.unit, base);
    ctx.fillText(clip(ctx, l.title, 34), cols.title, base);
    ctx.textAlign = "right";
    ctx.fillText(l.votes, cols.votes, base);
    ctx.textAlign = "left";
    hr(y + ROW_H);
    y += ROW_H;
  }

  ctx.fillStyle = "#999";
  ctx.font = `400 2.8px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`第 ${opts.pageNo} 页 / 共 ${opts.pageCount} 页`, A4.w / 2, A4.h - MARGIN + 2);
  return canvas;
}

export async function buildJudgeListPdf(
  lines: ListLine[],
  opts: { title: string; subtitle: string },
): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pages = paginateLines(lines);
  pages.forEach((pl, p) => {
    if (p > 0) doc.addPage();
    const canvas = drawPage(pl, { ...opts, first: p === 0, pageNo: p + 1, pageCount: pages.length });
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, A4.w, A4.h, undefined, "FAST");
  });
  doc.setProperties({ title: opts.title });
  return doc.output("blob");
}
