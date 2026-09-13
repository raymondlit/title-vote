import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shell, PageTitle, Panel } from "@/components/Shell";
import { ADMIN_NAV } from "@/components/adminNav";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { parseSheet, type SheetRow } from "@/lib/sheet";

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

  return (
    <Shell nav={ADMIN_NAV}>
      <PageTitle
        title="评审对象"
        description="名单需包含「姓名」，可含单位、现职称、评审类别、学科。类别与学科若不存在会自动创建并完成分组。"
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
          <h2 className="mb-6 text-[12px] tracking-[0.2em] text-muted-foreground">
            评审对象（{candidates.data?.length ?? 0}）
          </h2>
          <div className="space-y-3">
            {(candidates.data ?? []).map((c) => (
              <div
                key={c.id}
                className="hairline-t flex flex-wrap items-center gap-6 pt-3 text-[12px] tracking-[0.1em]"
              >
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
        </Panel>
      </div>
    </Shell>
  );
}
