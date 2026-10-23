import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, Panel } from "@/components/Shell";
import { useSession } from "@/lib/session";
import { useConfirm } from "@/components/ConfirmDialog";
import { deleteVoteSession } from "@/lib/admin.functions";
import { canArchive, canDelete, splitByArchive } from "@/lib/sessionArchive";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type DeleteTarget = { id: string; title: string; ballots: number; children: number };

function SessionsPage() {
  const { data: session } = useSession();
  const schoolId = session?.schoolId ?? null;
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const deleteFn = useServerFn(deleteVoteSession);

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [groupId, setGroupId] = useState("all");
  const [voterScope, setVoterScope] = useState<"group" | "all">("group");
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");



  const { data } = useQuery({
    queryKey: ["admin-sessions", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const [
        { data: sessions },
        { data: categories },
        { data: groups },
        { data: candidates },
        { data: offline },
      ] = await Promise.all([
          supabase
            .from("vote_sessions")
            .select("*")
            .eq("school_id", schoolId!)
            .order("created_at", { ascending: false }),
          supabase.from("review_categories").select("id, name").eq("school_id", schoolId!),
          supabase.from("subject_groups").select("id, name").eq("school_id", schoolId!),
          supabase
            .from("candidates")
            .select("id, category_id, group_id")
            .eq("school_id", schoolId!),
          supabase
            .from("offline_group_results")
            .select("candidate_id, category_id, is_recommended")
            .eq("school_id", schoolId!)
            .eq("is_recommended", true),
        ]);
      return {
        sessions: sessions ?? [],
        categories: categories ?? [],
        groups: groups ?? [],
        candidates: candidates ?? [],
        offline: offline ?? [],
      };
    },
  });

  const countFor = (categoryId: string | null, groupId: string | null) =>
    (data?.candidates ?? []).filter(
      (c) =>
        (!categoryId || c.category_id === categoryId) && (!groupId || c.group_id === groupId),
    ).length;

  const recommendedCount = (cat: string | null) =>
    (data?.offline ?? []).filter((r) => !cat || r.category_id === cat).length;

  /** 创建大评审场次：参评人员为线下推荐通过者，参与评委为大评审委员会成员 */
  async function createCommitteeSession() {
    if (!schoolId) return;
    const cat = categoryId === "all" ? null : categoryId;
    if (recommendedCount(cat) === 0) {
      toast.error("该类别下暂无线下推荐通过的人员，请先在「评审对象」录入学科组推荐结果");
      return;
    }
    const base = title.trim() || (cat ? nameOf(data?.categories, cat) : "") || "评审";
    const { error } = await supabase.from("vote_sessions").insert({
      school_id: schoolId,
      title: `${base} · 大评审`,
      category_id: cat,
      group_id: null,
      voter_scope: "committee",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitle("");
    toast.success("已创建大评审场次，开启后大评审委员会成员即可投票");
    queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
  }

  async function loadByGroups() {
    if (!schoolId) return;
    const cands = (data?.candidates ?? []).filter(
      (c) => categoryId === "all" || c.category_id === categoryId,
    );
    const groupIds = Array.from(
      new Set(cands.map((c) => c.group_id).filter((g): g is string => !!g)),
    );
    if (groupIds.length === 0) {
      toast.error("所选类别下的评审对象尚未分配学科小组");
      return;
    }
    const catName =
      categoryId === "all" ? "" : nameOf(data?.categories, categoryId);
    const base = title.trim() || catName || "评审投票";
    const existing = new Set(
      (data?.sessions ?? []).map((s) => `${s.category_id ?? ""}|${s.group_id ?? ""}`),
    );
    const rows = groupIds
      .filter((g) => !existing.has(`${categoryId === "all" ? "" : categoryId}|${g}`))
      .map((g) => ({
        school_id: schoolId,
        title: `${base} · ${nameOf(data?.groups, g)}`,
        category_id: categoryId === "all" ? null : categoryId,
        group_id: g,
        voter_scope: voterScope,
      }));
    if (rows.length === 0) {
      toast.info("各学科小组的投票场次已存在");
      return;
    }
    const { error } = await supabase.from("vote_sessions").insert(rows);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`已按学科分组生成 ${rows.length} 个投票场次`);
    queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
  }

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
      voter_scope: groupId === "all" ? "all" : voterScope,
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

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["result-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["round-summary"] });
  }

  async function setArchived(s: { id: string; title: string }, archive: boolean) {
    const ok = await confirm(
      archive
        ? {
            title: `归档「${s.title}」？`,
            description:
              "归档后该场次从当前列表和评委端隐藏，选票与确认单全部保留，可随时从「归档区」取回。",
            confirmLabel: "归档",
          }
        : {
            title: `取回「${s.title}」？`,
            description: "取回后该场次恢复到当前列表，评委端重新可见，原有选票不变。",
            confirmLabel: "取回",
          },
    );
    if (!ok) return;
    const { error } = await supabase
      .from("vote_sessions")
      .update(
        archive
          ? { archived_at: new Date().toISOString(), archived_by: session?.userId ?? null }
          : { archived_at: null, archived_by: null },
      )
      .eq("id", s.id)
      .eq("school_id", schoolId!);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(archive ? "已归档，可在「归档区」取回" : "已取回到当前列表");
    refreshAll();
  }

  async function openDelete(s: { id: string; title: string }) {
    const [{ count: ballots }, { count: children }] = await Promise.all([
      supabase.from("ballots").select("id", { count: "exact", head: true }).eq("session_id", s.id),
      supabase
        .from("vote_sessions")
        .select("id", { count: "exact", head: true })
        .eq("parent_session_id", s.id),
    ]);
    setPassword("");
    setDeleteError("");
    setDeleteTarget({ id: s.id, title: s.title, ballots: ballots ?? 0, children: children ?? 0 });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (!password) {
      setDeleteError("请输入您的登录密码");
      return;
    }
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteFn({ data: { sessionId: deleteTarget.id, password } });
      toast.success(`已删除「${deleteTarget.title}」及其 ${deleteTarget.ballots} 份选票`);
      setDeleteTarget(null);
      setPassword("");
      refreshAll();
    } catch (err) {
      setDeleteError((err as Error).message || "删除失败，请重试");
    }
    setDeleting(false);
  }

  const { active, archived } = splitByArchive(data?.sessions ?? []);
  const visible = tab === "active" ? active : archived;

  return (
    <>
      {confirmDialog}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="rounded-none sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-normal tracking-[0.16em]">
              永久删除投票场次
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-loose tracking-[0.1em]">
              「{deleteTarget?.title}」
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-[12px] leading-loose tracking-[0.1em]">
            <p className="text-destructive">
              本场次已有 {deleteTarget?.ballots ?? 0} 份评委选票，删除后选票与确认单将一并永久清除，无法恢复。
            </p>
            {deleteTarget && deleteTarget.children > 0 ? (
              <p className="text-muted-foreground">
                另有 {deleteTarget.children} 个后续轮次场次由本场派生，它们会保留，但不再关联本轮。
              </p>
            ) : null}
            <p className="text-muted-foreground">如只是不想在当前列表显示，建议改用「归档」。</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void confirmDelete();
            }}
            className="space-y-2"
          >
            <Label htmlFor="del-pwd" className="text-[11px] tracking-[0.2em] text-muted-foreground">
              请输入您的管理员登录密码以确认
            </Label>
            <Input
              id="del-pwd"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-none"
              autoFocus
            />
            {deleteError ? (
              <p className="text-[11px] tracking-[0.1em] text-destructive">{deleteError}</p>
            ) : null}
          </form>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="rounded-none text-[12px] tracking-[0.16em]"
            >
              取消
            </Button>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => {
                const t = deleteTarget;
                setDeleteTarget(null);
                if (t) void setArchived(t, true);
              }}
              className="rounded-none text-[12px] tracking-[0.16em]"
              hidden={tab === "archived"}
            >
              改为归档
            </Button>
            <Button
              variant="destructive"
              disabled={deleting || !password}
              onClick={() => void confirmDelete()}
              className="rounded-none text-[12px] tracking-[0.16em]"
            >
              {deleting ? "核验中…" : "核验密码并删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PageTitle
        title="投票场次"
        description="按评审类别与学科小组发起投票，开启后评委端可见，结束后不再接受提交。多轮遴选：本轮结束后在「投票结果」确认通过名单，再由剩余人员发起下一轮。不再关注的场次可归档，删除须输入管理员密码。"
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
          <div className="space-y-2 md:col-span-2">
            <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">参与评委</Label>
            <Select
              value={groupId === "all" ? "all" : voterScope}
              onValueChange={(v) => setVoterScope(v as "group" | "all")}
              disabled={groupId === "all"}
            >
              <SelectTrigger className="rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="group">仅该学科小组评委</SelectItem>
                <SelectItem value="all">全体评委</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-loose tracking-[0.1em] text-muted-foreground">
              {groupId === "all"
                ? "评审对象为全部学科，全体评委均可投票。"
                : voterScope === "group"
                  ? "仅该学科小组的评委可对本组参评人员投票。"
                  : "全体评委均可对该学科小组的参评人员投票。"}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button onClick={create} className="h-10 rounded-none px-8 text-[12px] tracking-[0.2em]">
            创建投票
          </Button>
          <Button
            variant="outline"
            onClick={loadByGroups}
            className="h-10 rounded-none px-8 text-[12px] tracking-[0.2em]"
          >
            加载评审对象
          </Button>
          <span className="text-[11px] tracking-[0.12em] text-muted-foreground">
            按学科小组把评审对象分别载入对应投票场次（当前所选类别共{" "}
            {countFor(categoryId === "all" ? null : categoryId, null)} 人）。
          </span>
          <Button
            variant="outline"
            onClick={createCommitteeSession}
            className="h-10 rounded-none px-8 text-[12px] tracking-[0.2em]"
          >
            创建大评审场次
          </Button>
          <span className="text-[11px] tracking-[0.12em] text-muted-foreground">
            参评人员为线下推荐通过者（当前类别 {recommendedCount(categoryId === "all" ? null : categoryId)} 人），
            由大评审委员会成员投票。
          </span>
        </div>
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
                    第 {s.round_number ?? 1} 轮 · {STATUS_LABEL[s.status]} · 类别{" "}
                    {nameOf(data?.categories, s.category_id)} · 小组{" "}
                    {nameOf(data?.groups, s.group_id)} · 参与评委{" "}
                    {s.voter_scope === "committee"
                      ? "大评审委员会"
                      : !s.group_id || s.voter_scope === "all"
                        ? "全体"
                        : "本组"}{" "}
                    · 评审对象{" "}
                    {Array.isArray(s.candidate_ids)
                      ? s.candidate_ids.length
                      : countFor(s.category_id, s.group_id)}{" "}
                    人
                    {s.max_recommend ? ` · 本轮名额 ${s.max_recommend} 人` : ""}
                    {Array.isArray(s.passed_candidate_ids)
                      ? ` · 已确认通过 ${s.passed_candidate_ids.length} 人`
                      : ""}
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
