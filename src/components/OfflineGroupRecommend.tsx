import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ConfirmDialog";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import { useServerFn } from "@tanstack/react-start";
import { clearOfflineGroupResults } from "@/lib/admin.functions";
import {
  parseSheet,
  downloadCsv,
  downloadXlsx,
  GROUP_SHEET_FIELDS,
  GROUP_SHEET_DEFAULT_KEYS,
  GROUP_SHEET_RESULT_COLUMNS,
  type SheetRow,
} from "@/lib/sheet";

type Named = { id: string; name: string };
type Candidate = {
  id: string;
  full_name: string;
  unit: string | null;
  current_title: string | null;
  notes: string | null;
  category_id: string | null;
  group_id: string | null;
};

type Design = {
  keys: string[];
  extra: string[];
  editable: string[];
  title: string;
  subtitle: string;
  footer: string;
};

const LOCKED_EDITABLE = GROUP_SHEET_RESULT_COLUMNS[0]!; // 是否推荐（解析必需）

const DEFAULT_DESIGN: Design = {
  keys: GROUP_SHEET_DEFAULT_KEYS,
  extra: [],
  editable: [...GROUP_SHEET_RESULT_COLUMNS],
  title: "学科组推荐表",
  subtitle: "本表由学科组线下评议后填写，「是否推荐」请填写「是」或「否」。",
  footer: "组长签字：____________　　组员签字：________________________________　　日期：____年____月____日",
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;",
  );

export function OfflineGroupRecommend({
  schoolId,
  categories,
  groups,
  candidates,
}: {
  schoolId: string | null;
  categories: Named[];
  groups: Named[];
  candidates: Candidate[];
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const clearFn = useServerFn(clearOfflineGroupResults);
  /** undefined = 未打开；null = 未分组 */
  const [clearTarget, setClearTarget] = useState<string | null | undefined>(undefined);
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [newCol, setNewCol] = useState("");
  const [newEditable, setNewEditable] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [openBatch, setOpenBatch] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("group_sheet_design");
      if (raw) setDesign({ ...DEFAULT_DESIGN, ...(JSON.parse(raw) as Partial<Design>) });
    } catch {
      /* 忽略损坏的本地设置 */
    }
  }, []);

  function persist(next: Design) {
    setDesign(next);
    localStorage.setItem("group_sheet_design", JSON.stringify(next));
  }

  const nameOf = (list: Named[], id: string | null) =>
    list.find((x) => x.id === id)?.name ?? "—";

  const activeFields = GROUP_SHEET_FIELDS.filter(
    (f) => f.required || design.keys.includes(f.key),
  );

  const scoped = useMemo(
    () =>
      candidates.filter(
        (c) =>
          (!categoryId || c.category_id === categoryId) && (!groupId || c.group_id === groupId),
      ),
    [candidates, categoryId, groupId],
  );

  const results = useQuery({
    queryKey: ["offline-group-results", schoolId],
    enabled: !!schoolId,
    // 实时推送连不上（如国内网络）时，每 15 秒自动刷新兜底
    refetchInterval: () => (document.visibilityState === "visible" ? 15000 : false),
    queryFn: async () => {
      const { data } = await supabase
        .from("offline_group_results")
        .select("*")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // 实时同步：线下推荐结果变动后自动刷新
  useEffect(() => {
    if (!schoolId) return;
    const channel = supabase
      .channel(`offline-results-${schoolId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offline_group_results",
          filter: `school_id=eq.${schoolId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["offline-group-results"] });
          queryClient.invalidateQueries({ queryKey: ["offline-batches", schoolId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [schoolId, queryClient]);

  const batches = useQuery({
    queryKey: ["offline-batches", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("offline_group_result_batches")
        .select("*")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const editableCols = design.editable.includes(LOCKED_EDITABLE)
    ? design.editable
    : [LOCKED_EDITABLE, ...design.editable];
  const blankCols = [...editableCols, ...design.extra];

  const headerLabels = ["序号", ...activeFields.map((f) => f.label), ...blankCols];

  function cellOf(c: Candidate, key: string) {
    if (key === "full_name") return c.full_name;
    if (key === "unit") return c.unit ?? "";
    if (key === "current_title") return c.current_title ?? "";
    if (key === "category") return nameOf(categories, c.category_id);
    if (key === "group") return nameOf(groups, c.group_id);
    if (key === "notes") return c.notes ?? "";
    return "";
  }

  function sheetRows(): string[][] {
    return [
      headerLabels,
      ...scoped.map((c, i) => [
        String(i + 1),
        ...activeFields.map((f) => cellOf(c, f.key)),
        ...blankCols.map(() => ""),
      ]),
    ];
  }

  const sheetTitle = () => {
    const parts = [
      categoryId ? nameOf(categories, categoryId) : "",
      groupId ? nameOf(groups, groupId) : "",
    ].filter(Boolean);
    return [design.title, ...parts].join("·");
  };

  function guardScope() {
    if (!schoolId) return false;
    if (scoped.length === 0) {
      toast.error("该类别与学科小组下暂无评审对象");
      return false;
    }
    return true;
  }

  function printSheet() {
    if (!guardScope()) return;
    const data = sheetRows();
    const head = data[0] ?? [];
    const body = data.slice(1);
    const win = window.open("", "_blank", "width=1000,height=760");
    if (!win) {
      toast.error("浏览器拦截了打印窗口，请允许弹出窗口");
      return;
    }
    const fixedCount = 1 + activeFields.length;
    const cls = (i: number) => (i === 0 ? "idx" : i >= fixedCount ? "fill" : "");
    win.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />
<title>${escapeHtml(sheetTitle())}</title>
<style>
@page{size:A4 landscape;margin:14mm;}
body{font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;color:#2b2b2b;padding:8px;}
h1{font-size:18px;font-weight:400;letter-spacing:.2em;text-align:center;margin:0 0 10px;}
p.sub{font-size:12px;line-height:1.9;color:#666;margin:0 0 18px;text-align:center;}
table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}
thead{display:table-header-group;}
th,td{border:1px solid #9c9a95;padding:6px 8px;text-align:center;font-weight:400;
  word-break:break-all;}
th{background:#f3f2ef;letter-spacing:.08em;}
td{height:34px;}
td.idx,th.idx{width:38px;color:#777;}
td.fill,th.fill{min-width:64px;}
td.fill{background:#fff;}
tr{page-break-inside:avoid;}
.foot{margin-top:28px;font-size:12px;line-height:2.6;}
</style></head><body>
<h1>${escapeHtml(sheetTitle())}</h1>
<p class="sub">${escapeHtml(design.subtitle)}</p>
<table><thead><tr>${head
      .map((h, i) => `<th class="${cls(i)}">${escapeHtml(h)}</th>`)
      .join("")}</tr></thead>
<tbody>${body
      .map(
        (r) =>
          `<tr>${r.map((c, i) => `<td class="${cls(i)}">${escapeHtml(c)}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table>
<div class="foot">${escapeHtml(design.footer)}</div>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  async function handleFile(file: File) {
    try {
      const parsed = (await parseSheet(file)).filter((r) => r["full_name"]);
      if (parsed.length === 0) {
        toast.error("未识别到「姓名」列，请使用下载的表格填写");
        return;
      }
      setRows(parsed);
      toast.success(`已读取 ${parsed.length} 条线下推荐记录`);
    } catch {
      toast.error("文件解析失败，请上传 Excel 或 CSV");
    }
  }

  const truthy = (value: string | undefined) =>
    ["是", "推荐", "y", "yes", "true", "1", "通过"].includes((value ?? "").trim().toLowerCase());

  // 按行内「学科分类」自动分组：名称匹配学科小组，同名候选人优先取本组的
  const groupIdByName = new Map(groups.map((g) => [g.name.trim(), g.id]));
  const matched = rows.map((r) => {
    const name = (r["full_name"] ?? "").trim();
    const rowGroupName = (r["group"] ?? "").trim();
    const rowGroupId = rowGroupName ? (groupIdByName.get(rowGroupName) ?? null) : undefined;
    const unknownGroup = rowGroupName !== "" && rowGroupId === null;
    const pool = rowGroupId ? scoped.filter((c) => c.group_id === rowGroupId) : scoped;
    const hit = pool.find((c) => c.full_name === name) ?? null;
    return {
      name,
      groupName: rowGroupName,
      unknownGroup,
      candidate: hit,
      is_recommended: truthy(r["is_recommended"]),
      agree_votes: Number(r["agree_votes"] ?? 0) || 0,
      total_votes: Number(r["total_votes"] ?? 0) || 0,
    };
  });
  const unmatched = matched.filter((m) => !m.candidate || m.unknownGroup).length;

  async function saveResults() {
    if (!schoolId || !guardScope()) return;
    const usable = matched.filter((m) => m.candidate && !m.unknownGroup);
    if (usable.length === 0) {
      toast.error("没有可录入的记录，请核对姓名与学科分类是否与名单一致");
      return;
    }
    setBusy(true);
    // 自动按学科分类分组：仅覆盖本次涉及的学科小组旧结果
    const perGroup = new Map<string | null, typeof usable>();
    for (const m of usable) {
      const gid = m.candidate!.group_id ?? null;
      perGroup.set(gid, [...(perGroup.get(gid) ?? []), m]);
    }
    const affectedIds = candidates
      .filter(
        (c) =>
          perGroup.has(c.group_id ?? null) && (!categoryId || c.category_id === categoryId),
      )
      .map((c) => c.id);
    if (affectedIds.length > 0) {
      await supabase.from("offline_group_results").delete().in("candidate_id", affectedIds);
    }
    const { error } = await supabase.from("offline_group_results").insert(
      usable.map((m) => ({
        school_id: schoolId,
        category_id: categoryId || null,
        group_id: m.candidate!.group_id ?? null,
        candidate_id: m.candidate!.id,
        is_recommended: m.is_recommended,
        agree_votes: m.agree_votes,
        total_votes: m.total_votes,
      })),
    );
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // 存入历史记录（按学科小组各存一份），便于历次结果对比与复核
    await supabase.from("offline_group_result_batches").insert(
      [...perGroup.entries()].map(([gid, list]) => ({
        school_id: schoolId,
        category_id: categoryId || null,
        group_id: gid,
        row_count: list.length,
        recommended_count: list.filter((m) => m.is_recommended).length,
        snapshot: list.map((m) => ({
          name: m.name,
          is_recommended: m.is_recommended,
          agree_votes: m.agree_votes,
          total_votes: m.total_votes,
        })),
      })),
    );
    setRows([]);
    toast.success(
      `已录入 ${usable.length} 条线下推荐结果，自动归入 ${perGroup.size} 个学科小组，旧结果已覆盖`,
    );
    // 结果入库后刷新相关名单：线下结果、评委/大评审名单、场次与评委端投票名单
    for (const key of [
      ["offline-group-results"],
      ["offline-batches"],
      ["judges"],
      ["admin-judges"],
      ["candidates"],
      ["sessions"],
      ["judge-sessions"],
      ["vote-session"],
      ["results"],
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    await queryClient.refetchQueries({ queryKey: ["offline-group-results"] });
  }

  function clearGroup(gid: string | null) {
    setClearTarget(gid);
  }

  async function confirmClearGroup(password: string) {
    if (!schoolId || clearTarget === undefined) return;
    const res = await clearFn({ data: { schoolId, groupId: clearTarget, password } });
    setClearTarget(undefined);
    toast.success(`已清除该组 ${res.removed} 条线下推荐结果，历史上传记录仍保留`);
    for (const key of [["offline-group-results"], ["offline-batches"], ["judge-sessions"], ["vote-session"]]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const byGroup = new Map<string, typeof results.data>();
  for (const r of results.data ?? []) {
    const key = r.group_id ?? "";
    byGroup.set(key, [...(byGroup.get(key) ?? []), r]);
  }
  const candidateName = (id: string) =>
    candidates.find((c) => c.id === id)?.full_name ?? "—";

  return (
    <Panel>
      <h2 className="mb-2 text-[12px] tracking-[0.2em] text-muted-foreground">学科组线下推荐</h2>
      <p className="mb-8 text-[11px] leading-loose tracking-[0.12em] text-muted-foreground">
        学科组在线下投票推荐：先设计并下载推荐表格，线下填写后上传录入「是否推荐 + 得票数」，推荐通过的人员即进入大评审。
      </p>

      {/* 步骤一：表格设计与下载 */}
      <div className="hairline-t pt-6">
        <h3 className="mb-5 text-[11px] tracking-[0.2em]">一　表格设计与下载</h3>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] tracking-[0.16em] text-muted-foreground">
              评审类别
            </span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full border-0 border-b bg-transparent py-1 text-[12px] focus:outline-none"
            >
              <option value="">全部类别</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] tracking-[0.16em] text-muted-foreground">
              学科小组
            </span>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full border-0 border-b bg-transparent py-1 text-[12px] focus:outline-none"
            >
              <option value="">全部学科小组（表格含学科分类列，上传后自动分组）</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-[12px] tracking-[0.1em]">
          {GROUP_SHEET_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={f.required}
                checked={f.required || design.keys.includes(f.key)}
                onChange={(e) =>
                  persist({
                    ...design,
                    keys: e.target.checked
                      ? [...design.keys, f.key]
                      : design.keys.filter((k) => k !== f.key),
                  })
                }
              />
              {f.label}
              {f.required ? <span className="text-muted-foreground">（必填）</span> : null}
            </label>
          ))}
          {design.extra.map((c) => (
            <span key={c} className="flex items-center gap-2">
              {c}
              <button
                className="text-[11px] text-muted-foreground hover:text-destructive"
                onClick={() =>
                  persist({ ...design, extra: design.extra.filter((x) => x !== c) })
                }
              >
                删除
              </button>
            </span>
          ))}
        </div>

        {/* 线下填写（可编辑）列 */}
        <div className="mt-6">
          <div className="mb-3 text-[11px] tracking-[0.16em] text-muted-foreground">
            线下填写列（表格中留空，供线下评审时手写或录入）
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-[12px] tracking-[0.1em]">
            {GROUP_SHEET_RESULT_COLUMNS.map((col) => (
              <label key={col} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={col === LOCKED_EDITABLE}
                  checked={editableCols.includes(col)}
                  onChange={(e) =>
                    persist({
                      ...design,
                      editable: e.target.checked
                        ? [...editableCols, col]
                        : editableCols.filter((x) => x !== col),
                    })
                  }
                />
                {col}
                {col === LOCKED_EDITABLE ? (
                  <span className="text-muted-foreground">（必填）</span>
                ) : null}
              </label>
            ))}
            {editableCols
              .filter((c) => !GROUP_SHEET_RESULT_COLUMNS.includes(c))
              .map((c) => (
                <span key={c} className="flex items-center gap-2">
                  {c}
                  <button
                    className="text-[11px] text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      persist({ ...design, editable: editableCols.filter((x) => x !== c) })
                    }
                  >
                    删除
                  </button>
                </span>
              ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <input
              value={newEditable}
              onChange={(e) => setNewEditable(e.target.value)}
              placeholder="新增填写列，如 组内排名 / 备注意见"
              className="w-56 border-0 border-b bg-transparent py-1 text-[12px] tracking-[0.1em] focus:outline-none"
            />
            <button
              className="text-[11px] tracking-[0.2em] underline"
              onClick={() => {
                const name = newEditable.trim();
                if (!name) return;
                if (headerLabels.includes(name)) {
                  toast.error("该栏目已存在");
                  return;
                }
                persist({ ...design, editable: [...editableCols, name] });
                setNewEditable("");
              }}
            >
              增加填写列
            </button>
          </div>
        </div>


        <div className="mt-5 flex flex-wrap items-center gap-4">
          <input
            value={newCol}
            onChange={(e) => setNewCol(e.target.value)}
            placeholder="新增自定义栏目，如 组内排名"
            className="w-56 border-0 border-b bg-transparent py-1 text-[12px] tracking-[0.1em] focus:outline-none"
          />
          <button
            className="text-[11px] tracking-[0.2em] underline"
            onClick={() => {
              const name = newCol.trim();
              if (!name) return;
              if ([...headerLabels].includes(name)) {
                toast.error("该栏目已存在");
                return;
              }
              persist({ ...design, extra: [...design.extra, name] });
              setNewCol("");
            }}
          >
            增加栏目
          </button>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] tracking-[0.16em] text-muted-foreground">
              表格标题
            </span>
            <input
              value={design.title}
              onChange={(e) => persist({ ...design, title: e.target.value })}
              className="w-full border-0 border-b bg-transparent py-1 text-[12px] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] tracking-[0.16em] text-muted-foreground">
              说明文字
            </span>
            <input
              value={design.subtitle}
              onChange={(e) => persist({ ...design, subtitle: e.target.value })}
              className="w-full border-0 border-b bg-transparent py-1 text-[12px] focus:outline-none"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-[11px] tracking-[0.16em] text-muted-foreground">
              页脚签字栏
            </span>
            <input
              value={design.footer}
              onChange={(e) => persist({ ...design, footer: e.target.value })}
              className="w-full border-0 border-b bg-transparent py-1 text-[12px] focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-6 text-[11px] tracking-[0.2em]">
          <button
            className="underline"
            onClick={() => {
              if (!guardScope()) return;
              downloadXlsx(`${sheetTitle()}.xlsx`, sheetRows(), "推荐表");
            }}
          >
            下载 Excel
          </button>
          <button
            className="underline"
            onClick={() => {
              if (!guardScope()) return;
              downloadCsv(`${sheetTitle()}.csv`, sheetRows());
            }}
          >
            下载 CSV
          </button>
          <button className="underline" onClick={printSheet}>
            打印 / 存 PDF
          </button>
          <span className="text-muted-foreground">
            当前范围共 {scoped.length} 位评审对象
          </span>
        </div>
      </div>

      {/* 步骤二：上传录入 */}
      <div className="hairline-t mt-8 pt-6">
        <h3 className="mb-5 text-[11px] tracking-[0.2em]">二　上传录入线下结果</h3>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="block text-[12px] text-muted-foreground"
        />
        {rows.length > 0 ? (
          <div className="mt-6">
            <div className="mb-3 text-[11px] tracking-[0.16em] text-muted-foreground">
              识别 {rows.length} 条{unmatched > 0 ? `，其中 ${unmatched} 条姓名或学科分类与名单不符（标红，不会录入）` : ""}
            </div>
            <div className="max-h-64 overflow-auto">
              {matched.map((m, i) => (
                <div
                  key={i}
                  className={`hairline-t flex flex-wrap gap-6 py-2 text-[12px] tracking-[0.1em] ${
                    m.candidate && !m.unknownGroup ? "" : "text-destructive"
                  }`}
                >
                  <span className="w-24">{m.name}</span>
                  <span className="w-28 text-muted-foreground">
                    {m.groupName || nameOf(groups, m.candidate?.group_id ?? null)}
                  </span>
                  <span className="w-24">{m.is_recommended ? "推荐" : "不推荐"}</span>
                  <span className="w-32 text-muted-foreground">
                    同意 {m.agree_votes} / 总 {m.total_votes}
                  </span>
                  {m.unknownGroup ? <span>学科分类不存在</span> : null}
                  {!m.unknownGroup && !m.candidate ? <span>名单中无此人</span> : null}
                </div>
              ))}
            </div>
            <Button
              onClick={saveResults}
              disabled={busy}
              className="mt-6 h-10 rounded-none px-8 text-[12px] tracking-[0.2em]"
            >
              确认录入（自动按学科分类分组）
            </Button>
          </div>
        ) : null}
      </div>

      {/* 步骤三：结果一览 */}
      <div className="hairline-t mt-8 pt-6">
        <h3 className="mb-5 text-[11px] tracking-[0.2em]">三　线下推荐结果一览</h3>
        {(results.data ?? []).length === 0 ? (
          <p className="text-[12px] tracking-[0.1em] text-muted-foreground">
            暂无已录入的线下推荐结果。
          </p>
        ) : (
          <div className="space-y-6">
            {Array.from(byGroup.entries()).map(([gid, list]) => (
              <div key={gid || "none"}>
                <div className="mb-3 flex items-center gap-6 text-[11px] tracking-[0.16em]">
                  <span>{gid ? nameOf(groups, gid) : "未分组"}</span>
                  <span className="text-muted-foreground">
                    共 {list?.length ?? 0} 人 · 推荐通过{" "}
                    {(list ?? []).filter((r) => r.is_recommended).length} 人
                  </span>
                  <button
                    className="text-muted-foreground underline hover:text-destructive"
                    onClick={() => clearGroup(gid || null)}
                  >
                    清除
                  </button>
                </div>
                {(list ?? []).map((r) => (
                  <div
                    key={r.id}
                    className="hairline-t flex flex-wrap items-center gap-6 py-2 text-[12px] tracking-[0.1em]"
                  >
                    <span className="w-24">{candidateName(r.candidate_id)}</span>
                    <span className="w-24">{r.is_recommended ? "推荐通过" : "未通过"}</span>
                    <span className="w-40 text-muted-foreground">
                      同意 {r.agree_votes} / 总 {r.total_votes}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("zh-CN")}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 步骤四：历次上传记录 */}
      <div className="hairline-t mt-8 pt-6">
        <h3 className="mb-5 text-[11px] tracking-[0.2em]">四　历次上传记录</h3>
        {(batches.data ?? []).length === 0 ? (
          <p className="text-[12px] tracking-[0.1em] text-muted-foreground">
            暂无历史记录，上传录入后会自动存档，便于对比与复核。
          </p>
        ) : (
          <div>
            {(batches.data ?? []).map((b) => {
              const snap = Array.isArray(b.snapshot)
                ? (b.snapshot as unknown as {
                    name: string;
                    is_recommended: boolean;
                    agree_votes: number;
                    total_votes: number;
                  }[])
                : [];
              const open = openBatch === b.id;
              return (
                <div key={b.id} className="hairline-t py-3">
                  <div className="flex flex-wrap items-center gap-6 text-[12px] tracking-[0.1em]">
                    <span className="w-40 text-muted-foreground">
                      {new Date(b.created_at).toLocaleString("zh-CN")}
                    </span>
                    <span className="w-28">{b.group_id ? nameOf(groups, b.group_id) : "未分组"}</span>
                    <span className="w-28 text-muted-foreground">
                      {b.category_id ? nameOf(categories, b.category_id) : "全部类别"}
                    </span>
                    <span className="text-muted-foreground">
                      共 {b.row_count} 人 · 推荐通过 {b.recommended_count} 人
                    </span>
                    <button
                      className="text-[11px] tracking-[0.2em] underline"
                      onClick={() => setOpenBatch(open ? null : b.id)}
                    >
                      {open ? "收起" : "查看明细"}
                    </button>
                    <button
                      className="text-[11px] tracking-[0.2em] underline text-muted-foreground"
                      onClick={() =>
                        downloadXlsx(
                          `线下推荐记录-${new Date(b.created_at).toLocaleDateString("zh-CN")}.xlsx`,
                          [
                            ["姓名", "是否推荐", "同意票数", "总票数"],
                            ...snap.map((s) => [
                              s.name,
                              s.is_recommended ? "是" : "否",
                              String(s.agree_votes),
                              String(s.total_votes),
                            ]),
                          ],
                          "历史记录",
                        )
                      }
                    >
                      导出
                    </button>
                  </div>
                  {open ? (
                    <div className="mt-3 pl-2">
                      {snap.map((s, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap gap-6 py-1 text-[12px] tracking-[0.1em]"
                        >
                          <span className="w-24">{s.name}</span>
                          <span className="w-24">{s.is_recommended ? "推荐通过" : "未通过"}</span>
                          <span className="text-muted-foreground">
                            同意 {s.agree_votes} / 总 {s.total_votes}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {dialog}
      <PasswordConfirmDialog
        open={clearTarget !== undefined}
        onOpenChange={(o) => {
          if (!o) setClearTarget(undefined);
        }}
        title="清除学科小组线下推荐结果"
        subject={clearTarget === undefined ? "" : clearTarget ? nameOf(groups, clearTarget) : "未分组"}
        confirmLabel="核验密码并清除"
        onConfirm={confirmClearGroup}
        archiveHint="如只是需要更正结果，直接重新上传新的推荐表即可覆盖，本次及以往的上传记录都会保留在历史中，便于复核。"
      >
        <p className="text-destructive">
          清除后该组 {clearTarget === undefined ? 0 : (byGroup.get(clearTarget ?? "") ?? []).length} 人的线下推荐结果将被删除，推荐通过者不再进入大评审范围。
        </p>
      </PasswordConfirmDialog>
    </Panel>
  );
}
