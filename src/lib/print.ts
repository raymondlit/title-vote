/** 全平台统一的打印样式与打印窗口工具 */

export const PRINT_BASE_CSS = `
@page{size:A4;margin:16mm;}
body{font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;color:#2b2b2b;padding:6px;}
h1{font-size:18px;font-weight:400;letter-spacing:.2em;text-align:center;margin:0 0 8px;}
p.sub{font-size:12px;line-height:1.9;color:#666;margin:0 0 16px;text-align:center;}
table{width:100%;border-collapse:collapse;font-size:12px;}
thead{display:table-header-group;}
th,td{border:1px solid #9c9a95;padding:6px 8px;text-align:center;font-weight:400;word-break:break-all;}
th{background:#f3f2ef;letter-spacing:.08em;}
td{height:30px;}
tr{page-break-inside:avoid;}
.foot{margin-top:24px;font-size:12px;line-height:2.6;}
`;

export function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;",
  );
}

export type PrintDocOptions = {
  title: string;
  body: string;
  extraCss?: string;
  landscape?: boolean;
};

export function printDocumentHtml({ title, body, extraCss, landscape }: PrintDocOptions) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${PRINT_BASE_CSS}${landscape ? "@page{size:A4 landscape;margin:14mm;}" : ""}${extraCss ?? ""}</style>
</head><body>${body}</body></html>`;
}

/** 打开打印窗口；被拦截时返回 false，由调用方提示 */
export function openPrintWindow(html: string): boolean {
  const win = window.open("", "_blank", "width=1000,height=760");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
