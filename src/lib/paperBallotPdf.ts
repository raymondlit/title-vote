/**
 * 应急纸质选票绘制：浏览器系统字体绘制到画布（中文正常），
 * 同一画布用于预览、PDF 导出与直接打印，确保三者完全一致。
 */
import { A4, MARGIN, FOOTER_H } from "@/lib/passwordBookPdf";
import {
  BALLOT_COLHEAD_H,
  BALLOT_GROUP_H,
  BALLOT_HEADER_H,
  BALLOT_RUN_H,
  BALLOT_SIGN_H,
  ballotColumns,
  paginateBallot,
  serialLabel,
  type BallotDoc,
  type BallotLine,
  type BallotMarks,
  type BallotOptionalColumn,
} from "@/lib/paperBallot";

export type RenderDoc = BallotDoc & { title: string; subtitle: string; instructions: string };

export type BallotLayout = {
  columns: BallotOptionalColumn[];
  marks: BallotMarks;
  rowH: number;
  signEveryPage: boolean;
  signLabel: string;
  copies: number;
  numbered: boolean;
};

const FONT = `"Noto Sans SC","PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif`;

function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      out.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) out.push(line);
  return out;
}

export function ballotPageCount(doc: BallotDoc, layout: BallotLayout) {
  return paginateBallot(doc.lines, {
    rowH: layout.rowH,
    signEveryPage: layout.signEveryPage,
    grouped: doc.grouped,
  }).length;
}

function drawPage(
  lines: BallotLine[],
  doc: RenderDoc,
  layout: BallotLayout,
  o: { first: boolean; last: boolean; pageNo: number; pageCount: number; serial: string | null; dpi: number },
) {
  const px = o.dpi / 25.4;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(A4.w * px);
  canvas.height = Math.round(A4.h * px);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(px, px);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4.w, A4.h);
  ctx.textBaseline = "alphabetic";
  const left = MARGIN;
  const right = A4.w - MARGIN;
  let y = MARGIN;

  if (o.first) {
    if (o.serial) {
      ctx.fillStyle = "#555";
      ctx.font = `400 3px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(`选票编号 ${o.serial}`, right, y + 2);
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#1f1f1f";
    ctx.font = `500 5.6px ${FONT}`;
    ctx.fillText(clip(ctx, doc.title, right - left), A4.w / 2, y + 9);
    ctx.fillStyle = "#555";
    ctx.font = `400 3.2px ${FONT}`;
    ctx.fillText(clip(ctx, doc.subtitle, right - left), A4.w / 2, y + 15);
    ctx.textAlign = "left";
    ctx.fillStyle = "#333";
    ctx.font = `400 3.1px ${FONT}`;
    wrap(ctx, doc.instructions, right - left)
      .slice(0, 3)
      .forEach((ln, i) => ctx.fillText(ln, left, y + 21.5 + i * 4.3));
    y += BALLOT_HEADER_H;
  } else {
    ctx.fillStyle = "#888";
    ctx.font = `400 2.8px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(
      clip(ctx, `${doc.title}${doc.groupLabel ? ` 【${doc.groupLabel}】` : ""}（续）`, 140),
      left,
      y + 4,
    );
    ctx.textAlign = "right";
    if (o.serial) ctx.fillText(`选票编号 ${o.serial}`, right, y + 4);
    ctx.textAlign = "left";
    y += BALLOT_RUN_H;
  }

  const cols = ballotColumns(layout.columns, layout.marks);
  const xs: number[] = [];
  cols.reduce((x, c) => (xs.push(x), x + c.w), left);
  const line = (x1: number, y1: number, x2: number, y2: number, color = "#9c9a95", w = 0.2) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const vlines = (top: number, bottom: number) => {
    xs.forEach((x) => line(x, top, x, bottom));
    line(right, top, right, bottom);
  };

  // 表头
  ctx.fillStyle = "#f3f2ef";
  ctx.fillRect(left, y, right - left, BALLOT_COLHEAD_H);
  ctx.fillStyle = "#333";
  ctx.font = `500 3px ${FONT}`;
  ctx.textAlign = "center";
  cols.forEach((c, i) => ctx.fillText(c.label, xs[i]! + c.w / 2, y + 5.8));
  line(left, y, right, y, "#555", 0.3);
  line(left, y + BALLOT_COLHEAD_H, right, y + BALLOT_COLHEAD_H, "#555", 0.3);
  vlines(y, y + BALLOT_COLHEAD_H);
  y += BALLOT_COLHEAD_H;

  for (const l of lines) {
    if (l.kind === "group") {
      ctx.fillStyle = "#faf9f7";
      ctx.fillRect(left, y, right - left, BALLOT_GROUP_H);
      ctx.fillStyle = "#333";
      ctx.font = `500 3.2px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(l.label, left + 3, y + 5.4);
      line(left, y, left, y + BALLOT_GROUP_H);
      line(right, y, right, y + BALLOT_GROUP_H);
      line(left, y + BALLOT_GROUP_H, right, y + BALLOT_GROUP_H, "#777");
      y += BALLOT_GROUP_H;
      continue;
    }
    const c = l.candidate;
    const base = y + layout.rowH / 2 + 1.2;
    cols.forEach((col, i) => {
      if (col.mark) return;
      const value =
        col.key === "no"
          ? String(l.no)
          : col.key === "name"
            ? c.full_name
            : col.key === "unit"
              ? (c.unit ?? "")
              : col.key === "title"
                ? (c.current_title ?? "")
                : col.key === "group"
                  ? l.groupLabel
                  : c.agree_votes != null
                    ? `${c.agree_votes}/${c.total_votes ?? "—"}`
                    : "";
      ctx.fillStyle = col.key === "name" ? "#1f1f1f" : "#444";
      ctx.font = `${col.key === "name" ? 500 : 400} ${col.key === "name" ? 3.5 : 3.1}px ${FONT}`;
      const alignLeft = col.key === "unit";
      ctx.textAlign = alignLeft ? "left" : "center";
      const text = clip(ctx, value, col.w - 3);
      ctx.fillText(text, alignLeft ? xs[i]! + 2 : xs[i]! + col.w / 2, base);
    });
    vlines(y, y + layout.rowH);
    line(left, y + layout.rowH, right, y + layout.rowH);
    y += layout.rowH;
  }

  if (layout.signEveryPage || o.last) {
    const sy = A4.h - MARGIN - FOOTER_H - BALLOT_SIGN_H + 10;
    ctx.fillStyle = "#333";
    ctx.font = `400 3.4px ${FONT}`;
    ctx.textAlign = "left";
    const label = `${layout.signLabel || "评委签名"}：`;
    ctx.fillText(label, left, sy);
    const lw = ctx.measureText(label).width;
    line(left + lw + 1, sy + 1, left + lw + 56, sy + 1, "#333", 0.25);
    const dateLabel = "日期：　　　　年　　月　　日";
    ctx.textAlign = "right";
    ctx.fillText(dateLabel, right, sy);
  }

  ctx.fillStyle = "#999";
  ctx.font = `400 2.8px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(
    `${o.serial ? `${o.serial} · ` : ""}第 ${o.pageNo} 页 / 共 ${o.pageCount} 页`,
    A4.w / 2,
    A4.h - MARGIN + 2,
  );
  return canvas;
}

/** 依次绘制每一页：每个学科组的所有份数连续排列，便于分发 */
export async function forEachBallotPage(
  docs: RenderDoc[],
  layout: BallotLayout,
  opts: { dpi: number; copies?: number; maxPages?: number },
  cb: (canvas: HTMLCanvasElement) => void | Promise<void>,
) {
  if (document.fonts?.ready) await document.fonts.ready;
  const copies = Math.max(1, opts.copies ?? layout.copies);
  let n = 0;
  for (const doc of docs) {
    const pages = paginateBallot(doc.lines, {
      rowH: layout.rowH,
      signEveryPage: layout.signEveryPage,
      grouped: doc.grouped,
    });
    for (let k = 0; k < copies; k++) {
      const serial = serialLabel(k, layout.numbered);
      for (let p = 0; p < pages.length; p++) {
        if (opts.maxPages != null && n >= opts.maxPages) return;
        const canvas = drawPage(pages[p]!, doc, layout, {
          first: p === 0,
          last: p === pages.length - 1,
          pageNo: p + 1,
          pageCount: pages.length,
          serial,
          dpi: opts.dpi,
        });
        await cb(canvas);
        n++;
        // 让出主线程，避免大量页数时界面卡住
        if (n % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
}

export async function buildPaperBallotPdf(docs: RenderDoc[], layout: BallotLayout, title: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  let first = true;
  await forEachBallotPage(docs, layout, { dpi: 200 }, (canvas) => {
    if (!first) pdf.addPage();
    first = false;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, A4.w, A4.h, undefined, "FAST");
  });
  pdf.setProperties({ title });
  return pdf.output("blob") as Blob;
}

/** 打印窗口须在点击时同步打开，避免被浏览器拦截；随后写入整页图片 */
export async function printPaperBallots(
  win: Window,
  docs: RenderDoc[],
  layout: BallotLayout,
  title: string,
) {
  const imgs: string[] = [];
  await forEachBallotPage(docs, layout, { dpi: 200 }, (canvas) => {
    imgs.push(canvas.toDataURL("image/png"));
  });
  const safe = title.replace(/[&<>"]/g, "");
  win.document.open();
  win.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><title>${safe}</title>
<style>@page{size:A4;margin:0;}html,body{margin:0;padding:0;}img{display:block;width:210mm;height:297mm;page-break-after:always;break-after:page;}img:last-child{page-break-after:auto;break-after:auto;}</style>
</head><body onload="window.focus();window.print();">${imgs.map((src) => `<img src="${src}" alt="" />`).join("")}</body></html>`);
  win.document.close();
}
