import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shell, PageTitle, Panel } from "@/components/Shell";
import { ADMIN_NAV } from "@/components/adminNav";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  parseSheet,
  downloadCsv,
  downloadXlsx,
  templateRowsFor,
  CANDIDATE_TEMPLATE_FIELDS,
  CANDIDATE_DEFAULT_KEYS,
  type SheetRow,
} from "@/lib/sheet";

const CANDIDATE_PAGE_SIZES = [10, 20, 40, 100] as const;


export const Route = createFileRoute("/_authenticated/admin/candidates")({
  head: () => ({
    meta: [
      { title: "评审对象 — 职称评审推荐投票平台" },
      { name: "description", content: "导入评审对象名单，按评审类别与学科自动归入对应小组。" },
      { property: "og:title", content: "评审对象 — 职称评审推荐投票平台" },
      {
        property: "og:description",
        content: "导入评审对象名单，按评审类别与学科自动归入对应小组。",
      },
    ],
  }),
  component: CandidatesPage,
});

function CandidatesPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<SheetRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [enabledKeys, setEnabledKeys] = useState<string[]>(CANDIDATE_DEFAULT_KEYS);
  const [extraCols, setExtraCols] = useState<string[]>([]);
  const [newCol, setNewCol] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    unit: "",
    current_title: "",
    category_id: "",
    group_id: "",
    notes: "",
  });


  useEffect(() => {
    try {
      const raw = localStorage.getItem("candidate_template");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { keys?: string[]; extra?: string[] };
      if (Array.isArray(parsed.keys)) setEnabledKeys(parsed.keys);
      if (Array.isArray(parsed.extra)) setExtraCols(parsed.extra);
    } catch {
      /* 忽略损坏的本地设置 */
    }
    const stored = Number(localStorage.getItem("candidate_list_page_size"));
    if (CANDIDATE_PAGE_SIZES.some((size) => size === stored)) setPageSize(stored);
  }, []);


  function persist(keys: string[], extra: string[]) {
    setEnabledKeys(keys);
    setExtraCols(extra);
    localStorage.setItem("candidate_template", JSON.stringify({ keys, extra }));
  }

  const activeFields = CANDIDATE_TEMPLATE_FIELDS.filter(
    (f) => f.required || enabledKeys.includes(f.key),
  );
  const templateRows = templateRowsFor([
    ...activeFields.map((f) => ({ label: f.label, sample: f.sample })),
    ...extraCols.map((label) => ({ label })),
  ]);

  const categories = useQuery({
    queryKey: ["review_categories"],
    queryFn: async () => {
      const { data } = await supabase.from("review_categories").select("*").order("sort_order");
      return data ?? [];
    },
  });
  const groups = useQuery({
    queryKey: ["subject_groups"],
    queryFn: async () => {
      const { data } = await supabase.from("subject_groups").select("*").order("sort_order");
      return data ?? [];
    },
  });
  const candidates = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const { data } = await supabase.from("candidates").select("*").order("created_at");
      return data ?? [];
    },
  });

  async function handleFile(file: File) {
    try {
      const rows = (await parseSheet(file)).filter((r) => r["full_name"]);
      if (rows.length === 0) {
        toast.error("未识别到「姓名」列，请检查表头");
        return;
      }
      setPreview(rows);
      toast.success(`已读取 ${rows.length} 位评审对象`);
    } catch {
      toast.error("文件解析失败，请上传 Excel 或 CSV");
    }
  }

  async function ensure(
    table: "review_categories" | "subject_groups",
    name: string,
    existing: { id: string; name: string }[],
  ) {
    const hit = existing.find((x) => x.name === name);
    if (hit) return hit.id;
    const { data, error } = await supabase
      .from(table)
      .insert({ school_id: session!.schoolId!, name, sort_order: existing.length })
      .select("id, name")
      .single();
    if (error || !data) return null;
    existing.push(data);
    return data.id;
  }

  async function doCreate() {
    if (!session?.schoolId) return;
    if (!form.full_name.trim()) {
      toast.error("请填写姓名");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("candidates").insert({
      school_id: session.schoolId,
      full_name: form.full_name.trim(),
      unit: form.unit.trim() || null,
      current_title: form.current_title.trim() || null,
      category_id: form.category_id || null,
      group_id: form.group_id || null,
      notes: form.notes.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`已新增评审对象 ${form.full_name.trim()}`);
    setForm({ full_name: "", unit: "", current_title: "", category_id: "", group_id: "", notes: "" });
    setShowAdd(false);
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
  }

  async function doImport() {
    if (!session?.schoolId) return;
    setBusy(true);
    const cats = [...(categories.data ?? [])].map((c) => ({ id: c.id, name: c.name }));
    const grps = [...(groups.data ?? [])].map((g) => ({ id: g.id, name: g.name }));
    const payload = [];
    for (const row of preview) {
      const categoryId = row["category"]
        ? await ensure("review_categories", row["category"], cats)
        : null;
      const groupId = row["group"] ? await ensure("subject_groups", row["group"], grps) : null;
      payload.push({
        school_id: session.schoolId,
        full_name: row["full_name"] ?? "",
        unit: row["unit"] || null,
        current_title: row["current_title"] || row["title"] || null,
        notes: row["notes"] || null,
        category_id: categoryId,
        group_id: groupId,
      });
    }
    const { error } = await supabase.from("candidates").insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPreview([]);
    toast.success(`已导入 ${payload.length} 位评审对象并自动分组`);
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
    queryClient.invalidateQueries({ queryKey: ["review_categories"] });
    queryClient.invalidateQueries({ queryKey: ["subject_groups"] });
  }

  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null) =>
    list?.find((x) => x.id === id)?.name ?? "—";

  type Candidate = NonNullable<typeof candidates.data>[number];

  function valueOf(c: Candidate, key: string) {
    if (key === "full_name") return c.full_name;
    if (key === "unit") return c.unit ?? "—";
    if (key === "current_title") return c.current_title ?? "—";
    if (key === "category") return nameOf(categories.data, c.category_id);
    if (key === "group") return nameOf(groups.data, c.group_id);
    if (key === "notes") return c.notes ?? "—";
    return "—";
  }

  const candidateList = candidates.data ?? [];
  const totalPages = Math.max(1, Math.ceil(candidateList.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleCandidates = candidateList.slice(pageStart, pageStart + pageSize);
  const visibleCandidateIds = visibleCandidates.map((c) => c.id);
  const allVisibleSelected =
    visibleCandidateIds.length > 0 && visibleCandidateIds.every((id) => selected.has(id));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function changePageSize(value: number) {
    setPageSize(value);
    setPage(1);
    localStorage.setItem("candidate_list_page_size", String(value));
  }

  function toggleVisible(on: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      visibleCandidateIds.forEach((id) => {
        if (on) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }

  const printRows = candidateList.filter((c) => selected.has(c.id));


  async function batchDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error("请先勾选需要删除的参评人员");
      return;
    }
    if (!window.confirm(`确定批量删除已勾选的 ${ids.length} 位参评人员？此操作不可恢复。`))
      return;
    setBusy(true);
    const { error } = await supabase.from("candidates").delete().in("id", ids);
    setBusy(false);
    if (error) {
      toast.error(`删除失败：${error.message}`);
      return;
    }
    setSelected(new Set());
    toast.success(`已批量删除 ${ids.length} 位参评人员`);
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
  }

  function printList() {
    if (selected.size === 0) {
      toast.error("请先勾选需要打印的参评人员");
      return;
    }
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 100);
  }

  return (
    <Shell nav={ADMIN_NAV}>
      <PageTitle
        title="评审对象"
        description="名单需包含「姓名」，可含单位、现职称、评审类别、学科。类别与学科若不存在会自动创建并完成分组。"
      />

      <div className="space-y-10">
        <Panel>
          <div className="mb-8 no-print">
            <h2 className="mb-4 text-[12px] tracking-[0.2em] text-muted-foreground">
              名单模板栏目（可勾选、可增删）
            </h2>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-[12px] tracking-[0.1em]">
              {CANDIDATE_TEMPLATE_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={f.required}
                    checked={f.required || enabledKeys.includes(f.key)}
                    onChange={(e) =>
                      persist(
                        e.target.checked
                          ? [...enabledKeys, f.key]
                          : enabledKeys.filter((k) => k !== f.key),
                        extraCols,
                      )
                    }
                  />
                  {f.label}
                  {f.required ? <span className="text-muted-foreground">（必填）</span> : null}
                </label>
              ))}
              {extraCols.map((c) => (
                <span key={c} className="flex items-center gap-2">
                  {c}
                  <button
                    className="text-[11px] text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      persist(
                        enabledKeys,
                        extraCols.filter((x) => x !== c),
                      )
                    }
                  >
                    删除
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <input
                value={newCol}
                onChange={(e) => setNewCol(e.target.value)}
                placeholder="新增自定义栏目，如 最高学历"
                className="w-56 border-0 border-b bg-transparent py-1 text-[12px] tracking-[0.1em] focus:outline-none"
              />
              <button
                className="text-[11px] tracking-[0.2em] underline"
                onClick={() => {
                  const name = newCol.trim();
                  if (!name) return;
                  const exists = [
                    ...CANDIDATE_TEMPLATE_FIELDS.map((f) => f.label),
                    ...extraCols,
                  ].includes(name);
                  if (exists) {
                    toast.error("该栏目已存在");
                    return;
                  }
                  persist(enabledKeys, [...extraCols, name]);
                  setNewCol("");
                }}
              >
                增加栏目
              </button>
              <span className="text-[11px] tracking-[0.16em] text-muted-foreground">
                自定义栏目仅用于线下收集信息，导入时按基础栏目入库
              </span>
            </div>
          </div>

          <div className="no-print mb-6 flex flex-wrap items-center gap-6 text-[11px] tracking-[0.2em]">
            <button
              className="underline"
              onClick={() => downloadXlsx("参评人员名单模板.xlsx", templateRows, "参评人员名单")}
            >
              下载名单模板 XLSX
            </button>
            <button
              className="underline"
              onClick={() => downloadCsv("参评人员名单模板.csv", templateRows)}
            >
              下载名单模板 CSV
            </button>
            <span className="text-muted-foreground">请保留表头，删除示例行后填写</span>
          </div>

          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="no-print block text-[12px] text-muted-foreground"
          />
          {preview.length > 0 ? (
            <div className="mt-8 no-print">
              <div className="mb-4 text-[12px] tracking-[0.16em] text-muted-foreground">
                待导入 {preview.length} 人
              </div>
              <div className="max-h-64 overflow-auto">
                {preview.slice(0, 50).map((r, i) => (
                  <div key={i} className="hairline-t py-2 text-[12px] tracking-[0.1em]">
                    {r["full_name"]}
                    <span className="ml-6 text-muted-foreground">{r["unit"] ?? ""}</span>
                    <span className="ml-6 text-muted-foreground">{r["category"] ?? ""}</span>
                    <span className="ml-6 text-muted-foreground">{r["group"] ?? ""}</span>
                  </div>
                ))}
              </div>
              <Button
                onClick={doImport}
                disabled={busy}
                className="mt-6 h-10 rounded-none px-8 text-[12px] tracking-[0.2em]"
              >
                确认导入
              </Button>
            </div>
          ) : null}
        </Panel>

        <Panel>
          <div className="no-print mb-6 flex flex-wrap items-center gap-6">
            <h2 className="text-[12px] tracking-[0.2em] text-muted-foreground">
              评审对象（{candidates.data?.length ?? 0}）
            </h2>
            <label className="flex items-center gap-2 text-[11px] tracking-[0.16em] text-muted-foreground">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(e) => toggleVisible(e.target.checked)}
              />
              全选本页
            </label>

            <button
              className="text-[11px] tracking-[0.2em] underline disabled:text-muted-foreground"
              onClick={printList}
              disabled={selected.size === 0}
            >
              打印名单（已选 {selected.size} 人）
            </button>
            <button
              className="text-[11px] tracking-[0.2em] text-destructive underline disabled:text-muted-foreground"
              onClick={batchDelete}
              disabled={busy || selected.size === 0}
            >
              批量删除（已选 {selected.size} 人）
            </button>
            <span className="text-[11px] tracking-[0.16em] text-muted-foreground">
              打印内容按上方勾选的栏目生成
            </span>
          </div>
          <div className="no-print space-y-3">
            {visibleCandidates.map((c) => (

              <div
                key={c.id}
                className="hairline-t flex flex-wrap items-center gap-6 pt-3 text-[12px] tracking-[0.1em]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      return next;
                    })
                  }
                />
                <span className="w-20">{c.full_name}</span>
                <span className="w-40 text-muted-foreground">{c.unit ?? "—"}</span>
                <span className="w-24 text-muted-foreground">{c.current_title ?? "—"}</span>
                <span className="w-24">{nameOf(categories.data, c.category_id)}</span>
                <span className="w-32">{nameOf(groups.data, c.group_id)}</span>
                <button
                  className="ml-auto text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await supabase.from("candidates").delete().eq("id", c.id);
                    queryClient.invalidateQueries({ queryKey: ["candidates"] });
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>

          {candidateList.length > 0 ? (
            <div className="no-print mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-5 text-[11px] tracking-[0.12em] text-muted-foreground">
              <span>
                显示第 {pageStart + 1}–{Math.min(pageStart + pageSize, candidateList.length)} 人，共 {candidateList.length} 人
              </span>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-none px-4 text-[11px]"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  上一页
                </Button>
                <span className="tabular-nums">第 {currentPage} / {totalPages} 页</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-none px-4 text-[11px]"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                >
                  下一页
                </Button>
                <label className="ml-4 flex items-center gap-2 text-[11px] tracking-[0.16em]">
                  每页
                  <select
                    aria-label="每页显示评审对象数量"
                    value={pageSize}
                    onChange={(event) => changePageSize(Number(event.target.value))}
                    className="border-0 border-b bg-transparent px-1 py-1 text-[11px] text-foreground focus:outline-none"
                  >
                    {CANDIDATE_PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                  人
                </label>
              </div>
            </div>
          ) : null}

          {printing && printRows.length > 0 ? (

            <div className="print-area print-only">
              <h3 className="mb-6 text-[14px] tracking-[0.2em]">参评人员名单</h3>
              <table className="w-full border-collapse text-[12px] tracking-[0.1em]">
                <thead>
                  <tr>
                    <th className="hairline-b py-2 text-left font-normal">序号</th>
                    {activeFields.map((f) => (
                      <th key={f.key} className="hairline-b py-2 text-left font-normal">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {printRows.map((c, i) => (
                    <tr key={c.id}>
                      <td className="hairline-b py-2">{i + 1}</td>
                      {activeFields.map((f) => (
                        <td key={f.key} className="hairline-b py-2">
                          {valueOf(c, f.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>
      </div>
    </Shell>
  );
}
