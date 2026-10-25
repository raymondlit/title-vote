/**
 * 评委密码本 PDF 导出：每位评委一张独立裁切纸条（姓名 / 用户名 / 密码 / 登录网址），
 * 纸条整条落在同一页，不会被分页截断。文字用浏览器系统字体绘制到画布再嵌入 PDF，
 * 保证中文正常显示，无需额外下载字体文件。
 */

export type PasswordBookEntry = { full_name: string; username: string; password: string | null };

export const A4 = { w: 210, h: 297 };
export const MARGIN = 14; // mm
export const HEADER_H = 16; // 首页标题区（mm）
export const FOOTER_H = 8; // 页码区（mm）
export const SLIP_H = 30; // 每张纸条高度（mm）

/** 按页拆分纸条：首页留出标题区，之后每页尽量排满，纸条不跨页 */
export function paginateSlips<T>(entries: T[], slipH = SLIP_H): T[][] {
  const usable = A4.h - MARGIN * 2 - FOOTER_H;
  const firstCap = Math.max(1, Math.floor((usable - HEADER_H) / slipH));
  const restCap = Math.max(1, Math.floor(usable / slipH));
  const pages: T[][] = [];
  let i = 0;
  while (i < entries.length) {
    const cap = pages.length === 0 ? firstCap : restCap;
    pages.push(entries.slice(i, i + cap));
    i += cap;
  }
  return pages.length ? pages : [[]];
}

const FONT = `"Noto Sans SC","PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif`;
const DPI = 200;
const PX = DPI / 25.4; // px per mm

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

function drawPage(
  pageEntries: PasswordBookEntry[],
  startIndex: number,
  opts: { schoolName: string; loginUrl: string; first: boolean; pageNo: number; pageCount: number },
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(A4.w * PX);
  canvas.height = Math.round(A4.h * PX);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(PX, PX); // 以下坐标单位均为 mm
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4.w, A4.h);
  ctx.textBaseline = "alphabetic";
  const left = MARGIN;
  const width = A4.w - MARGIN * 2;
  let y = MARGIN;

  if (opts.first) {
    ctx.fillStyle = "#2b2b2b";
    ctx.font = `400 5.2px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`${opts.schoolName ? opts.schoolName + " · " : ""}评委密码本`, A4.w / 2, y + 6);
    ctx.font = `400 3px ${FONT}`;
    ctx.fillStyle = "#777";
    ctx.fillText("请沿虚线裁开，每位评委一张，妥善保管，勿转交他人", A4.w / 2, y + 11.5);
    ctx.textAlign = "left";
    y += HEADER_H;
  }

  // 首条上方也画一条裁切线
  const dash = (yy: number) => {
    ctx.save();
    ctx.strokeStyle = "#9a9893";
    ctx.lineWidth = 0.25;
    ctx.setLineDash([1.6, 1.2]);
    ctx.beginPath();
    ctx.moveTo(left + 5, yy);
    ctx.lineTo(left + width, yy);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#9a9893";
    ctx.font = `400 3.4px ${FONT}`;
    ctx.fillText("✂", left, yy + 1.2);
  };
  dash(y);

  pageEntries.forEach((e, k) => {
    const top = y + k * SLIP_H;
    const idx = startIndex + k + 1;
    ctx.fillStyle = "#999";
    ctx.font = `400 3px ${FONT}`;
    ctx.fillText(String(idx).padStart(2, "0"), left + 2, top + 8.5);

    const col = (label: string, value: string, x: number, mono = false) => {
      ctx.fillStyle = "#888";
      ctx.font = `400 2.8px ${FONT}`;
      ctx.fillText(label, x, top + 5.5);
      ctx.fillStyle = "#1f1f1f";
      ctx.font = mono ? `500 4.2px ui-monospace,Menlo,Consolas,monospace` : `500 4.2px ${FONT}`;
      ctx.fillText(value, x, top + 11);
    };
    col("姓名", e.full_name, left + 12);
    col("用户名", e.username, left + 52, true);
    col("密码", e.password ?? "（未记录）", left + 122, !!e.password);

    ctx.fillStyle = "#888";
    ctx.font = `400 2.8px ${FONT}`;
    ctx.fillText("评审登录网址", left + 12, top + 17);
    ctx.fillStyle = "#1f1f1f";
    ctx.font = `400 3.4px ui-monospace,Menlo,Consolas,monospace`;
    wrap(ctx, opts.loginUrl, width - 14)
      .slice(0, 2)
      .forEach((line, li) => ctx.fillText(line, left + 12, top + 21.5 + li * 4.2));

    dash(top + SLIP_H);
  });

  ctx.fillStyle = "#999";
  ctx.font = `400 2.8px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`第 ${opts.pageNo} 页 / 共 ${opts.pageCount} 页`, A4.w / 2, A4.h - MARGIN + 2);
  return canvas;
}

export async function buildPasswordBookPdf(
  entries: PasswordBookEntry[],
  opts: { schoolName: string; loginUrl: string },
): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pages = paginateSlips(entries);
  let start = 0;
  pages.forEach((pageEntries, p) => {
    if (p > 0) doc.addPage();
    const canvas = drawPage(pageEntries, start, {
      ...opts,
      first: p === 0,
      pageNo: p + 1,
      pageCount: pages.length,
    });
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, A4.w, A4.h, undefined, "FAST");
    start += pageEntries.length;
  });
  doc.setProperties({ title: `${opts.schoolName}评委密码本` });
  return doc.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
