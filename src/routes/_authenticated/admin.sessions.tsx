import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, Panel } from "@/components/Shell";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/sessions")({
  component: SessionsPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "未开始",
  open: "进行中",
  closed: "已结束",
};

function SessionsPage() {
  const { data: session } = useSession();
  const schoolId = session?.schoolId ?? null;
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [groupId, setGroupId] = useState("all");

  const { data } = useQuery({
    queryKey: ["admin-sessions", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const [{ data: sessions }, { data: categories }, { data: groups }] = await Promise.all([
        supabase
          .from("vote_sessions")
          .select("*")
          .eq("school_id", schoolId!)
          .order("created_at", { ascending: false }),
        supabase.from("review_categories").select("id, name").eq("school_id", schoolId!),
        supabase.from("subject_groups").select("id, name").eq("school_id", schoolId!),
      ]);
      return { sessions: sessions ?? [], categories: categories ?? [], groups: groups ?? [] };
    },
  });

  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null) =>
    id ? (list ?? []).find((x) => x.id === id)?.name ?? "—" : "全部";

  async function create() {
    if (!title.trim() || !schoolId) {
      toast.error("请填写投票名称");
      return;
    }
    const { error } = await supabase.from("vote_sessions").insert({
      school_id: schoolId,
      title: title.trim(),
      category_id: categoryId === "all" ? null : categoryId,
      group_id: groupId === "all" ? null : groupId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitle("");
    toast.success("已创建，开启后评委即可投票");
    queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
  }

  async function setStatus(id: string, status: string) {
    const patch = {
      status,
      ...(status === "open" ? { opened_at: new Date().toISOString() } : {}),
      ...(status === "closed" ? { closed_at: new Date().toISOString() } : {}),
    };
    const { error } = await supabase
      .from("vote_sessions")
      .update(patch)
      .eq("id", id)
      .eq("school_id", schoolId!);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
  }

  async function remove(id: string) {
    const { error } = await supabase
      .from("vote_sessions")
      .delete()
      .eq("id", id)
      .eq("school_id", schoolId!);

    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
  }

  return (
    <>
      <PageTitle
        title="投票场次"
        description="按评审类别与学科小组发起投票，开启后评委端可见，结束后不再接受提交。"
      />

      <Panel className="mb-10">
        <div className="grid gap-6 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="s-title" className="text-[11px] tracking-[0.2em] text-muted-foreground">
              投票名称
            </Label>
            <Input
              id="s-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：2026 年高级职称推荐投票"
              className="rounded-none"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">评审类别</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">全部</SelectItem>
                {(data?.categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">学科小组</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">全部</SelectItem>
                {(data?.groups ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={create} className="mt-8 h-10 rounded-none px-8 text-[12px] tracking-[0.2em]">
          创建投票
        </Button>
      </Panel>

      <Panel className="p-0">
        {(data?.sessions ?? []).length === 0 ? (
          <p className="p-8 text-[12px] tracking-[0.1em] text-muted-foreground">暂无投票场次。</p>
        ) : (
          <ul>
            {(data?.sessions ?? []).map((s) => (
              <li
                key={s.id}
                className="hairline-b flex items-center justify-between px-8 py-6 last:border-b-0"
              >
                <div>
                  <div className="text-[13px] tracking-[0.12em]">{s.title}</div>
                  <div className="mt-2 text-[11px] tracking-[0.16em] text-muted-foreground">
                    {STATUS_LABEL[s.status]} · 类别 {nameOf(data?.categories, s.category_id)} · 小组{" "}
                    {nameOf(data?.groups, s.group_id)}
                  </div>
                </div>
                <div className="flex items-center gap-5 text-[11px] tracking-[0.16em]">
                  {s.status === "draft" ? (
                    <button onClick={() => setStatus(s.id, "open")} className="hover:underline">
                      开启投票
                    </button>
                  ) : null}
                  {s.status === "open" ? (
                    <button onClick={() => setStatus(s.id, "closed")} className="hover:underline">
                      结束投票
                    </button>
                  ) : null}
                  <button
                    onClick={() => remove(s.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
