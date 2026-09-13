import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shell, PageTitle, Panel } from "@/components/Shell";
import { ADMIN_NAV } from "@/components/adminNav";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/rules")({
  head: () => ({
    meta: [
      { title: "投票规则 — 职称评审推荐投票平台" },
      { name: "description", content: "设定每项评审的推荐上限、是否允许弃权与必须逐项表态。" },
      { property: "og:title", content: "投票规则 — 职称评审推荐投票平台" },
      {
        property: "og:description",
        content: "设定每项评审的推荐上限、是否允许弃权与必须逐项表态。",
      },
    ],
  }),
  component: RulesPage,
});

function RulesPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [total, setTotal] = useState("30");
  const [maxRecommend, setMaxRecommend] = useState("11");
  const [allowAbstain, setAllowAbstain] = useState(true);
  const [requireAll, setRequireAll] = useState(true);

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
  const rules = useQuery({
    queryKey: ["voting_rules"],
    queryFn: async () => {
      const { data } = await supabase.from("voting_rules").select("*").order("created_at");
      return data ?? [];
    },
  });

  async function addRule() {
    if (!session?.schoolId) return;
    const totalCount = Number(total);
    const max = Number(maxRecommend);
    if (!Number.isFinite(totalCount) || !Number.isFinite(max) || max < 1 || max > totalCount) {
      toast.error("推荐上限需为 1 至参评总数之间的整数");
      return;
    }
    const { error } = await supabase.from("voting_rules").insert({
      school_id: session.schoolId,
      category_id: categoryId || null,
      group_id: groupId || null,
      total_count: totalCount,
      max_recommend: max,
      allow_abstain: allowAbstain,
      require_all: requireAll,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("规则已保存");
      queryClient.invalidateQueries({ queryKey: ["voting_rules"] });
    }
  }

  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null) =>
    id ? (list?.find((x) => x.id === id)?.name ?? "—") : "全部";

  return (
    <Shell nav={ADMIN_NAV}>
      <PageTitle
        title="投票规则"
        description="例如参评 30 人、最多推荐 11 人。评委端超出上限时将无法提交并给出提示。"
      />

      <div className="space-y-10">
        <Panel>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">
                适用评审类别
              </Label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-10 w-full border-0 border-b bg-transparent text-[13px] focus:outline-none"
              >
                <option value="">全部类别</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">
                适用学科小组
              </Label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="h-10 w-full border-0 border-b bg-transparent text-[13px] focus:outline-none"
              >
                <option value="">全部小组</option>
                {(groups.data ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">参评总数</Label>
              <Input
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                inputMode="numeric"
                className="rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">
                最多推荐人数
              </Label>
              <Input
                value={maxRecommend}
                onChange={(e) => setMaxRecommend(e.target.value)}
                inputMode="numeric"
                className="rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-8 text-[12px] tracking-[0.12em]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowAbstain}
                onChange={(e) => setAllowAbstain(e.target.checked)}
              />
              允许弃权
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requireAll}
                onChange={(e) => setRequireAll(e.target.checked)}
              />
              必须对每位对象作出选择
            </label>
          </div>

          <Button
            onClick={addRule}
            className="mt-8 h-10 rounded-none px-8 text-[12px] tracking-[0.2em]"
          >
            保存规则
          </Button>
        </Panel>

        <Panel>
          <h2 className="mb-6 text-[12px] tracking-[0.2em] text-muted-foreground">已设规则</h2>
          <div className="space-y-3">
            {(rules.data ?? []).map((r) => (
              <div
                key={r.id}
                className="hairline-t flex flex-wrap items-center gap-6 pt-3 text-[12px] tracking-[0.1em]"
              >
                <span className="w-24">{nameOf(categories.data, r.category_id)}</span>
                <span className="w-32">{nameOf(groups.data, r.group_id)}</span>
                <span className="text-muted-foreground">
                  参评 {r.total_count} 人 · 最多推荐 {r.max_recommend} 人
                </span>
                <span className="text-muted-foreground">
                  {r.allow_abstain ? "可弃权" : "不可弃权"} ·{" "}
                  {r.require_all ? "须逐项表态" : "可留空"}
                </span>
                <button
                  className="ml-auto text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await supabase.from("voting_rules").delete().eq("id", r.id);
                    queryClient.invalidateQueries({ queryKey: ["voting_rules"] });
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
