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

export const Route = createFileRoute("/_authenticated/admin/groups")({
  head: () => ({
    meta: [
      { title: "类别与分组 — 职称评审推荐投票平台" },
      { name: "description", content: "维护评审类别与学科小组，并设定组长产生方式。" },
      { property: "og:title", content: "类别与分组 — 职称评审推荐投票平台" },
      { property: "og:description", content: "维护评审类别与学科小组，并设定组长产生方式。" },
    ],
  }),
  component: GroupsPage,
});

function GroupsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [categoryName, setCategoryName] = useState("");
  const [groupName, setGroupName] = useState("");

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

  const judges = useQuery({
    queryKey: ["judges"],
    queryFn: async () => {
      const { data } = await supabase.from("judges").select("*").order("created_at");
      return data ?? [];
    },
  });

  async function addCategory() {
    if (!session?.schoolId || !categoryName.trim()) return;
    const { error } = await supabase.from("review_categories").insert({
      school_id: session.schoolId,
      name: categoryName.trim(),
      sort_order: categories.data?.length ?? 0,
    });
    if (error) toast.error(error.message);
    else {
      setCategoryName("");
      queryClient.invalidateQueries({ queryKey: ["review_categories"] });
    }
  }

  async function addGroup() {
    if (!session?.schoolId || !groupName.trim()) return;
    const { error } = await supabase.from("subject_groups").insert({
      school_id: session.schoolId,
      name: groupName.trim(),
      sort_order: groups.data?.length ?? 0,
    });
    if (error) toast.error(error.message);
    else {
      setGroupName("");
      queryClient.invalidateQueries({ queryKey: ["subject_groups"] });
    }
  }

  return (
    <Shell nav={ADMIN_NAV}>
      <PageTitle
        title="类别与分组"
        description="评审类别用于区分职称序列，学科小组用于把评委与评审对象归入同一评议单元。"
      />

      <div className="grid gap-10 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-6 text-[12px] tracking-[0.2em] text-muted-foreground">评审类别</h2>
          <div className="flex gap-4">
            <Input
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="如：教授"
              className="rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            <Button
              onClick={addCategory}
              className="h-10 shrink-0 rounded-none px-6 text-[12px] tracking-[0.2em]"
            >
              添加
            </Button>
          </div>
          <div className="mt-8 space-y-3">
            {(categories.data ?? []).map((c) => (
              <div
                key={c.id}
                className="hairline-t flex items-center justify-between pt-3 text-[12px] tracking-[0.1em]"
              >
                <span>{c.name}</span>
                <button
                  className="text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await supabase.from("review_categories").delete().eq("id", c.id);
                    queryClient.invalidateQueries({ queryKey: ["review_categories"] });
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-6 text-[12px] tracking-[0.2em] text-muted-foreground">学科小组</h2>
          <div className="flex gap-4">
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="如：数学与统计"
              className="rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            <Button
              onClick={addGroup}
              className="h-10 shrink-0 rounded-none px-6 text-[12px] tracking-[0.2em]"
            >
              添加
            </Button>
          </div>
          <div className="mt-8 space-y-5">
            {(groups.data ?? []).map((g) => {
              const members = (judges.data ?? []).filter((j) => j.group_id === g.id);
              const leader = members.find((m) => m.is_group_leader);
              return (
                <div key={g.id} className="hairline-t pt-4">
                  <div className="flex items-center justify-between text-[12px] tracking-[0.1em]">
                    <span>{g.name}</span>
                    <button
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        await supabase.from("subject_groups").delete().eq("id", g.id);
                        queryClient.invalidateQueries({ queryKey: ["subject_groups"] });
                      }}
                    >
                      删除
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] tracking-[0.12em] text-muted-foreground">
                    组员 {members.length} 人 · 组长 {leader?.full_name ?? "未指定"}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-[11px] tracking-[0.12em]">
                    <span className="text-muted-foreground">组长产生方式</span>
                    <select
                      value={g.leader_mode}
                      onChange={async (e) => {
                        await supabase
                          .from("subject_groups")
                          .update({ leader_mode: e.target.value })
                          .eq("id", g.id);
                        queryClient.invalidateQueries({ queryKey: ["subject_groups"] });
                      }}
                      className="border-0 border-b bg-transparent py-1 focus:outline-none"
                    >
                      <option value="appointed">由主任/副主任任命</option>
                      <option value="elected">组内推选</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
