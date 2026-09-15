import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shell, PageTitle, Panel } from "@/components/Shell";
import { ADMIN_NAV } from "@/components/adminNav";
import { Button } from "@/components/ui/button";
import { COMMITTEE_ROLE_LABELS } from "@/lib/account";
import {
  parseSheet,
  downloadCsv,
  downloadXlsx,
  templateRowsFor,
  JUDGE_TEMPLATE_FIELDS,
  DEFAULT_TEMPLATE_KEYS,
  type SheetRow,
} from "@/lib/sheet";
import { importJudges, deleteJudge, getJudgePasswordBook } from "@/lib/admin.functions";
import { useSession, useSchool } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/admin/judges")({
  head: () => ({
    meta: [
      { title: "评委管理 — 职称评审推荐投票平台" },
      { name: "description", content: "导入评委名单、生成登录凭证、设置职务与学科小组。" },
      { property: "og:title", content: "评委管理 — 职称评审推荐投票平台" },
      { property: "og:description", content: "导入评委名单、生成登录凭证、设置职务与学科小组。" },
    ],
  }),
  component: JudgesPage,
});

function JudgesPage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const school = useSchool(session.data?.schoolId);
  const [preview, setPreview] = useState<SheetRow[]>([]);
  const [accounts, setAccounts] = useState<
    { full_name: string; username: string; password: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [enabledKeys, setEnabledKeys] = useState<string[]>(DEFAULT_TEMPLATE_KEYS);
  const [extraCols, setExtraCols] = useState<string[]>([]);
  const [newCol, setNewCol] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [book, setBook] = useState<
    { full_name: string; username: string; password: string | null }[]
  >([]);

  // 载入管理员上次保存的模板设置
  useEffect(() => {
    try {
      const raw = localStorage.getItem("judge_template");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { keys?: string[]; extra?: string[] };
      if (Array.isArray(parsed.keys)) setEnabledKeys(parsed.keys);
      if (Array.isArray(parsed.extra)) setExtraCols(parsed.extra);
    } catch {
      /* 忽略损坏的本地设置 */
    }
  }, []);

  function persist(keys: string[], extra: string[]) {
    setEnabledKeys(keys);
    setExtraCols(extra);
    localStorage.setItem("judge_template", JSON.stringify({ keys, extra }));
  }

  const templateFields = [
    ...JUDGE_TEMPLATE_FIELDS.filter((f) => f.required || enabledKeys.includes(f.key)).map((f) => ({
      label: f.label,
      sample: f.sample,
    })),
    ...extraCols.map((label) => ({ label })),
  ];
  const templateRows = templateRowsFor(templateFields);


  const importFn = useServerFn(importJudges);
  const deleteFn = useServerFn(deleteJudge);
  const bookFn = useServerFn(getJudgePasswordBook);

  const judges = useQuery({
    queryKey: ["judges"],
    queryFn: async () => {
      const { data } = await supabase.from("judges").select("*").order("created_at");
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

  async function handleFile(file: File) {
    try {
      const rows = await parseSheet(file);
      const valid = rows.filter((r) => r["full_name"]);
      if (valid.length === 0) {
        toast.error("未识别到「姓名」列，请检查表头");
        return;
      }
      setPreview(valid);
      toast.success(`已读取 ${valid.length} 位评委，确认后导入`);
    } catch {
      toast.error("文件解析失败，请上传 Excel 或 CSV");
    }
  }

  async function doImport() {
    setBusy(true);
    try {
      const res = await importFn({
        data: {
          rows: preview.map((r) => ({
            full_name: r["full_name"] ?? "",
            staff_no: r["staff_no"] || null,
            unit: r["unit"] || null,
            title: r["title"] || null,
            phone: r["phone"] || null,
          })),
        },
      });
      setAccounts(res.accounts);
      setPreview([]);
      toast.success(`已导入 ${res.imported} 位评委`);
      queryClient.invalidateQueries({ queryKey: ["judges"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  async function update(
    id: string,
    patch: {
      committee_role?: "chair" | "vice_chair" | "member";
      group_id?: string | null;
      is_group_leader?: boolean;
    },
  ) {
    const { error } = await supabase.from("judges").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else queryClient.invalidateQueries({ queryKey: ["judges"] });
  }

  function toggleSelect(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function passwordBookHtml(
    entries: { full_name: string; username: string; password: string | null }[],
  ) {
    const rows = entries
      .map(
        (e, i) =>
          `<tr><td>${i + 1}</td><td>${e.full_name}</td><td>${e.username}</td><td>${e.password ?? "（未记录）"}</td></tr>`,
      )
      .join("");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>评委密码本</title>
<style>
body{font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;color:#2b2b2b;margin:32px;}
h1{font-size:16px;font-weight:400;letter-spacing:.2em;margin:0 0 24px;}
table{width:100%;border-collapse:collapse;font-size:12px;letter-spacing:.06em;}
th,td{border-bottom:1px solid #d9d7d2;padding:8px 6px;text-align:left;font-weight:400;}
@page{margin:16mm;}
</style></head><body>
<h1>评委密码本</h1>
<table><thead><tr><th style="width:48px">序号</th><th style="width:96px">姓名</th><th>用户名</th><th>密码</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
  }

  async function printPasswordBook() {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error("请先勾选需要打印的评委");
      return;
    }
    setBusy(true);
    try {
      const res = await bookFn({ data: { judgeIds: ids } });
      setBook(res.entries);
      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) {
        toast.error("浏览器拦截了打印窗口，请允许弹出窗口后重试");
      } else {
        win.document.write(passwordBookHtml(res.entries));
        win.document.close();
        win.focus();
        setTimeout(() => {
          win.print();
          win.close();
        }, 300);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  async function togglePasswordPolicy(on: boolean) {
    const id = session.data?.schoolId;
    if (!id) return;
    const { error } = await supabase
      .from("schools")
      .update({ allow_judge_password_change: on })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      queryClient.invalidateQueries({ queryKey: ["school", id] });
      toast.success(on ? "已允许评委自行修改密码" : "已关闭评委自行修改密码");
    }
  }

  function exportAccountsDoc() {
    const rows = accounts
      .map(
        (a, i) =>
          `<tr><td>${i + 1}</td><td>${a.full_name}</td><td>${a.username}</td><td>${a.password}</td></tr>`,
      )
      .join("");
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body style="font-family:'Noto Sans SC',SimSun,sans-serif">
<h2 style="font-weight:400;letter-spacing:2px">评委账号密码对照表</h2>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-size:12px">
<tr><th>序号</th><th>姓名</th><th>账号</th><th>初始密码</th></tr>${rows}</table>
</body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "评委账号密码对照表.doc";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Shell nav={ADMIN_NAV}>
      <PageTitle
        title="评委管理"
        description="上传 Excel 或 CSV 名单（需含「姓名」列，可含工号、单位、职称、电话），系统会为每位评委生成账号与一次性密码。"
      />

      <div className="space-y-10">
        <Panel>
          <div className="mb-8">
            <h2 className="mb-4 text-[12px] tracking-[0.2em] text-muted-foreground">
              名单模板栏目（可勾选、可增删）
            </h2>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-[12px] tracking-[0.1em]">
              {JUDGE_TEMPLATE_FIELDS.map((f) => (
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
                placeholder="新增自定义栏目，如 邮箱"
                className="w-56 border-0 border-b bg-transparent py-1 text-[12px] tracking-[0.1em] focus:outline-none"
              />
              <button
                className="text-[11px] tracking-[0.2em] underline"
                onClick={() => {
                  const name = newCol.trim();
                  if (!name) return;
                  const exists = [
                    ...JUDGE_TEMPLATE_FIELDS.map((f) => f.label),
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
                自定义栏目仅用于线下收集信息，导入时按基础栏目建账号
              </span>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-6 text-[11px] tracking-[0.2em]">
            <button
              className="underline"
              onClick={() => downloadXlsx("评委名单模板.xlsx", templateRows, "评委名单")}
            >
              下载名单模板 XLSX
            </button>
            <button
              className="underline"
              onClick={() => downloadCsv("评委名单模板.csv", templateRows)}
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
            className="block text-[12px] text-muted-foreground"
          />
          {preview.length > 0 ? (
            <div className="mt-8">
              <div className="mb-4 text-[12px] tracking-[0.16em] text-muted-foreground">
                待导入 {preview.length} 人
              </div>
              <div className="max-h-64 overflow-auto">
                {preview.slice(0, 50).map((r, i) => (
                  <div key={i} className="hairline-t py-2 text-[12px] tracking-[0.1em]">
                    {r["full_name"]}
                    <span className="ml-6 text-muted-foreground">{r["unit"] ?? ""}</span>
                    <span className="ml-6 text-muted-foreground">{r["title"] ?? ""}</span>
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

          {accounts.length > 0 ? (
            <div className="mt-8 border border-foreground/30 p-6">
              <p className="no-print text-[12px] tracking-[0.12em]">
                以下账号密码仅显示一次，请立即导出或打印保存。
              </p>
              <div className="print-area mt-6">
                <h3 className="mb-6 text-[14px] tracking-[0.2em]">评委账号密码对照表</h3>
                <table className="w-full border-collapse text-[12px] tracking-[0.1em]">
                  <thead>
                    <tr>
                      <th className="hairline-b py-2 text-left font-normal text-muted-foreground">
                        序号
                      </th>
                      <th className="hairline-b py-2 text-left font-normal text-muted-foreground">
                        姓名
                      </th>
                      <th className="hairline-b py-2 text-left font-normal text-muted-foreground">
                        账号
                      </th>
                      <th className="hairline-b py-2 text-left font-normal text-muted-foreground">
                        初始密码
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a, i) => (
                      <tr key={a.username}>
                        <td className="hairline-b py-2">{i + 1}</td>
                        <td className="hairline-b py-2">{a.full_name}</td>
                        <td className="hairline-b py-2">{a.username}</td>
                        <td className="hairline-b py-2">{a.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="no-print mt-6 flex flex-wrap gap-6 text-[11px] tracking-[0.2em]">
                <button className="underline" onClick={exportAccountsDoc}>
                  导出 DOC
                </button>
                <button className="underline" onClick={() => window.print()}>
                  打印 / 存为 PDF
                </button>
                <button
                  className="underline"
                  onClick={() =>
                    downloadCsv("评委账号.csv", [
                      ["姓名", "账号", "密码"],
                      ...accounts.map((a) => [a.full_name, a.username, a.password]),
                    ])
                  }
                >
                  导出表格
                </button>
                <button
                  className="underline"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      accounts.map((a) => `${a.full_name} ${a.username} ${a.password}`).join("\n"),
                    );
                    toast.success("已复制");
                  }}
                >
                  复制全部
                </button>
                <button className="underline" onClick={() => setAccounts([])}>
                  我已保存
                </button>
              </div>
            </div>
          ) : null}
        </Panel>

        <Panel>
          <div className="no-print mb-6 flex flex-wrap items-center gap-6">
            <h2 className="text-[12px] tracking-[0.2em] text-muted-foreground">
              评委名单（{judges.data?.length ?? 0}）
            </h2>
            <label className="flex items-center gap-2 text-[11px] tracking-[0.16em] text-muted-foreground">
              <input
                type="checkbox"
                checked={
                  (judges.data?.length ?? 0) > 0 && selected.size === (judges.data?.length ?? 0)
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? new Set((judges.data ?? []).map((j) => j.id)) : new Set(),
                  )
                }
              />
              全选
            </label>
            <button
              className="text-[11px] tracking-[0.2em] underline disabled:text-muted-foreground"
              onClick={printPasswordBook}
              disabled={busy || selected.size === 0}
            >
              打印密码本（已选 {selected.size} 人）
            </button>
          </div>
          <div className="no-print space-y-4">
            {(judges.data ?? []).map((j) => (
              <div
                key={j.id}
                className="hairline-t flex flex-wrap items-center gap-6 pt-4 text-[12px] tracking-[0.1em]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(j.id)}
                  onChange={(e) => toggleSelect(j.id, e.target.checked)}
                />
                <span className="w-20">{j.full_name}</span>
                <span className="w-40 text-muted-foreground">{j.unit ?? "—"}</span>
                <span className="w-32 text-muted-foreground">{j.username}</span>
                <select
                  value={j.committee_role}
                  onChange={(e) =>
                    update(j.id, {
                      committee_role: e.target.value as "chair" | "vice_chair" | "member",
                    })
                  }
                  className="border-0 border-b bg-transparent py-1 text-[12px] focus:outline-none"
                >
                  {Object.entries(COMMITTEE_ROLE_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  value={j.group_id ?? ""}
                  onChange={(e) => update(j.id, { group_id: e.target.value || null })}
                  className="border-0 border-b bg-transparent py-1 text-[12px] focus:outline-none"
                >
                  <option value="">未分组</option>
                  {(groups.data ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={j.is_group_leader}
                    onChange={(e) => update(j.id, { is_group_leader: e.target.checked })}
                  />
                  组长
                </label>
                <button
                  className="ml-auto text-[11px] tracking-[0.16em] text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await deleteFn({ data: { judgeId: j.id } });
                    queryClient.invalidateQueries({ queryKey: ["judges"] });
                  }}
                >
                删除
                </button>
              </div>
            ))}
          </div>

          {book.length > 0 ? (
            <div className="print-area print-only">
              <h3 className="mb-6 text-[14px] tracking-[0.2em]">评委密码本</h3>
              <table className="w-full border-collapse text-[12px] tracking-[0.1em]">
                <thead>
                  <tr>
                    <th className="hairline-b py-2 text-left font-normal">序号</th>
                    <th className="hairline-b py-2 text-left font-normal">姓名</th>
                    <th className="hairline-b py-2 text-left font-normal">用户名</th>
                    <th className="hairline-b py-2 text-left font-normal">密码</th>
                  </tr>
                </thead>
                <tbody>
                  {book.map((e, i) => (
                    <tr key={e.username}>
                      <td className="hairline-b py-2">{i + 1}</td>
                      <td className="hairline-b py-2">{e.full_name}</td>
                      <td className="hairline-b py-2">{e.username}</td>
                      <td className="hairline-b py-2">{e.password ?? "（已修改，未记录）"}</td>
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
