import { useState } from "react";
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
  JUDGE_TEMPLATE_ROWS,
  type SheetRow,
} from "@/lib/sheet";
import { importJudges, deleteJudge } from "@/lib/admin.functions";

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
  const [preview, setPreview] = useState<SheetRow[]>([]);
  const [accounts, setAccounts] = useState<
    { full_name: string; username: string; password: string }[]
  >([]);
  const [busy, setBusy] = useState(false);

  const importFn = useServerFn(importJudges);
  const deleteFn = useServerFn(deleteJudge);

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

  return (
    <Shell nav={ADMIN_NAV}>
      <PageTitle
        title="评委管理"
        description="上传 Excel 或 CSV 名单（需含「姓名」列，可含工号、单位、职称、电话），系统会为每位评委生成账号与一次性密码。"
      />

      <div className="space-y-10">
        <Panel>
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
              <p className="text-[12px] tracking-[0.12em]">
                以下账号密码仅显示一次，请立即导出保存。
              </p>
              <div className="mt-4 flex gap-6 text-[11px] tracking-[0.2em]">
                <button
                  className="underline"
                  onClick={() =>
                    downloadCsv("评委账号.csv", [
                      ["姓名", "账号", "密码"],
                      ...accounts.map((a) => [a.full_name, a.username, a.password]),
                    ])
                  }
                >
                  导出账号表
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
          <h2 className="mb-6 text-[12px] tracking-[0.2em] text-muted-foreground">
            评委名单（{judges.data?.length ?? 0}）
          </h2>
          <div className="space-y-4">
            {(judges.data ?? []).map((j) => (
              <div
                key={j.id}
                className="hairline-t flex flex-wrap items-center gap-6 pt-4 text-[12px] tracking-[0.1em]"
              >
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
        </Panel>
      </div>
    </Shell>
  );
}
