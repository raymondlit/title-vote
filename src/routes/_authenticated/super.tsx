import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shell, PageTitle, Panel } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ALL_PERMISSIONS, PERMISSION_LABELS } from "@/lib/account";
import {
  createSchoolAdmin,
  deleteSchool,
  resetUserPassword,
  setAdminPermissions,
  setUserActive,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/super")({
  head: () => ({
    meta: [
      { title: "超级用户后台 — 职称评审推荐投票平台" },
      { name: "description", content: "管理高校与高校管理员账号、权限。" },
      { property: "og:title", content: "超级用户后台 — 职称评审推荐投票平台" },
      { property: "og:description", content: "管理高校与高校管理员账号、权限。" },
    ],
  }),
  component: SuperPage,
});

const NAV = [{ to: "/super", label: "高校与管理员" }];
const PAGE_SIZES = [10, 20, 40, 100];

function slugify(input: string) {
  const ascii = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (ascii) return ascii.slice(0, 24);
  return "sch" + Math.random().toString(36).slice(2, 8);
}

type Tab = "schools" | "admins";

function SuperPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("schools");

  // 新增高校
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [slug, setSlug] = useState("");

  // 新增管理员
  const [selectedSchool, setSelectedSchool] = useState<string>("");
  const [adminName, setAdminName] = useState("");
  const [perms, setPerms] = useState<string[]>(ALL_PERMISSIONS);
  const [credential, setCredential] = useState<{ username: string; password: string } | null>(null);

  // 分页
  const [schoolPage, setSchoolPage] = useState(1);
  const [schoolSize, setSchoolSize] = useState(10);
  const [adminPage, setAdminPage] = useState(1);
  const [adminSize, setAdminSize] = useState(10);

  const createAdminFn = useServerFn(createSchoolAdmin);
  const resetPwFn = useServerFn(resetUserPassword);
  const setPermsFn = useServerFn(setAdminPermissions);
  const setActiveFn = useServerFn(setUserActive);
  const deleteSchoolFn = useServerFn(deleteSchool);

  const schools = useQuery({
    queryKey: ["schools"],
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("*").order("created_at");
      return data ?? [];
    },
  });

  const admins = useQuery({
    queryKey: ["admins"],
    queryFn: async () => {
      const [{ data: roles }, { data: profiles }, { data: permissions }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
        supabase.from("profiles").select("*"),
        supabase.from("admin_permissions").select("user_id, permission"),
      ]);
      const ids = new Set((roles ?? []).map((r) => r.user_id));
      return (profiles ?? [])
        .filter((p) => ids.has(p.id))
        .map((p) => ({
          ...p,
          permissions: (permissions ?? [])
            .filter((x) => x.user_id === p.id)
            .map((x) => x.permission as string),
        }));
    },
  });

  const schoolList = schools.data ?? [];
  const adminList = admins.data ?? [];

  const pagedSchools = useMemo(
    () => schoolList.slice((schoolPage - 1) * schoolSize, schoolPage * schoolSize),
    [schoolList, schoolPage, schoolSize],
  );
  const pagedAdmins = useMemo(
    () => adminList.slice((adminPage - 1) * adminSize, adminPage * adminSize),
    [adminList, adminPage, adminSize],
  );

  const addSchool = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("schools").insert({
        name: name.trim(),
        short_name: shortName.trim() || null,
        slug: (slug.trim() || slugify(shortName || name)).toLowerCase(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("高校已添加");
      setName("");
      setShortName("");
      setSlug("");
      queryClient.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addAdmin = useMutation({
    mutationFn: async () => {
      if (!selectedSchool) throw new Error("请选择学校");
      if (!adminName.trim()) throw new Error("请输入管理员姓名");
      return createAdminFn({
        data: { schoolId: selectedSchool, fullName: adminName.trim(), permissions: perms },
      });
    },
    onSuccess: (res) => {
      setCredential({ username: res.username, password: res.password });
      setAdminName("");
      queryClient.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell nav={NAV}>
      <PageTitle
        title="高校与管理员"
        description="新增高校后，为其创建管理员账号并分配系统权限。同一高校可以有多个权限不同的管理员。"
      />

      <div className="mb-10 flex gap-10 border-b border-border">
        {(
          [
            ["schools", `高校（${schoolList.length}）`],
            ["admins", `管理员（${adminList.length}）`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b pb-4 text-[13px] tracking-[0.2em] transition-colors ${
              tab === key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "schools" ? (
        <div className="space-y-10">
          <Panel>
            <h2 className="mb-6 text-[12px] tracking-[0.2em] text-muted-foreground">新增高校</h2>
            <div className="grid gap-6 md:grid-cols-3">
              <Field label="学校名称" value={name} onChange={setName} />
              <Field label="简称" value={shortName} onChange={setShortName} />
              <Field label="标识（登录页地址，可留空自动生成）" value={slug} onChange={setSlug} />
            </div>
            <Button
              className="mt-8 h-10 rounded-none px-8 text-[12px] tracking-[0.2em]"
              disabled={addSchool.isPending || !name.trim()}
              onClick={() => addSchool.mutate()}
            >
              添加
            </Button>
          </Panel>

          <Panel>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-[12px] tracking-[0.2em] text-muted-foreground">
                高校列表（{schoolList.length}）
              </h2>
              <PageSizeSelect
                value={schoolSize}
                onChange={(v) => {
                  setSchoolSize(v);
                  setSchoolPage(1);
                }}
              />
            </div>
            <div className="space-y-3">
              {pagedSchools.map((s) => (
                <div
                  key={s.id}
                  className="hairline-t flex items-center justify-between gap-4 pt-3 text-[12px] tracking-[0.1em]"
                >
                  <span>{s.name}</span>
                  <span className="text-muted-foreground">/school/{s.slug}</span>
                  <button
                    className="text-[11px] tracking-[0.16em] text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      const go = await confirm({
                        title: `删除高校「${s.name}」`,
                        description: "该校的管理员账号将一并删除，此操作不可恢复。",
                        confirmLabel: "确认删除",
                        destructive: true,
                      });
                      if (!go) return;
                      try {
                        const res = await deleteSchoolFn({ data: { schoolId: s.id } });
                        if (!res.ok) {
                          const ok = await confirm({
                            title: "该校仍有评审数据",
                            description: `已有${res.blocking.join("、")}数据，确认后将连同这些数据一起永久删除。`,
                            confirmLabel: "一并永久删除",
                            destructive: true,
                          });
                          if (!ok) return;
                          await deleteSchoolFn({ data: { schoolId: s.id, force: true } });
                        }
                        toast.success("高校已删除");
                        queryClient.invalidateQueries({ queryKey: ["schools"] });
                        queryClient.invalidateQueries({ queryKey: ["admins"] });
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}

                  >
                    删除
                  </button>
                </div>
              ))}
              {pagedSchools.length === 0 ? (
                <p className="hairline-t pt-4 text-[12px] text-muted-foreground">暂无高校</p>
              ) : null}
            </div>
            <Pager
              total={schoolList.length}
              page={schoolPage}
              size={schoolSize}
              onPage={setSchoolPage}
            />
          </Panel>
        </div>
      ) : (
        <div className="space-y-10">
          <Panel>
            <h2 className="mb-6 text-[12px] tracking-[0.2em] text-muted-foreground">新增管理员</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">学校</Label>
                <select
                  value={selectedSchool}
                  onChange={(e) => setSelectedSchool(e.target.value)}
                  className="h-10 w-full border-0 border-b bg-transparent text-[13px] focus:outline-none"
                >
                  <option value="">请选择</option>
                  {schoolList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <Field label="管理员姓名" value={adminName} onChange={setAdminName} />
            </div>

            <div className="mt-8">
              <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">系统权限</Label>
              <div className="mt-4 flex flex-wrap gap-6">
                {ALL_PERMISSIONS.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-[12px] tracking-[0.1em]">
                    <Checkbox
                      checked={perms.includes(p)}
                      onCheckedChange={(v) =>
                        setPerms((prev) => (v ? [...prev, p] : prev.filter((x) => x !== p)))
                      }
                    />
                    {PERMISSION_LABELS[p]}
                  </label>
                ))}
              </div>
            </div>

            <Button
              className="mt-8 h-10 rounded-none px-8 text-[12px] tracking-[0.2em]"
              disabled={addAdmin.isPending}
              onClick={() => addAdmin.mutate()}
            >
              生成账号
            </Button>

            {credential ? (
              <div className="mt-8 border border-foreground/30 bg-background p-6">
                <p className="text-[12px] tracking-[0.12em]">
                  管理员「{credential.username}」登录密码：
                  <span className="mx-1 font-mono">{credential.password}</span>
                  （请立即复制保存，仅显示一次）
                </p>
                <button
                  className="mt-4 text-[11px] tracking-[0.2em] underline"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `账号 ${credential.username} 密码 ${credential.password}`,
                    );
                    toast.success("已复制");
                  }}
                >
                  复制
                </button>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-[12px] tracking-[0.2em] text-muted-foreground">
                管理员列表（{adminList.length}）
              </h2>
              <PageSizeSelect
                value={adminSize}
                onChange={(v) => {
                  setAdminSize(v);
                  setAdminPage(1);
                }}
              />
            </div>
            <div className="space-y-6">
              {pagedAdmins.map((a) => {
                const school = schoolList.find((s) => s.id === a.school_id);
                return (
                  <div key={a.id} className="hairline-t pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="text-[13px] tracking-[0.1em]">
                        {a.full_name}
                        <span className="ml-4 text-[11px] text-muted-foreground">
                          {a.username}
                        </span>
                        <span className="ml-4 text-[11px] text-muted-foreground">
                          {school?.name ?? "—"}
                        </span>
                        {!a.is_active ? (
                          <span className="ml-4 text-[11px] text-destructive">已停用</span>
                        ) : null}
                      </div>
                      <div className="flex gap-5 text-[11px] tracking-[0.16em] text-muted-foreground">
                        <button
                          className="hover:text-foreground"
                          onClick={async () => {
                            const res = await resetPwFn({ data: { userId: a.id } });
                            setCredential({ username: a.username ?? "", password: res.password });
                            toast.success("新密码已生成，见上方提示框");
                          }}
                        >
                          重置密码
                        </button>
                        <button
                          className="hover:text-foreground"
                          onClick={async () => {
                            await setActiveFn({ data: { userId: a.id, isActive: !a.is_active } });
                            queryClient.invalidateQueries({ queryKey: ["admins"] });
                          }}
                        >
                          {a.is_active ? "停用" : "启用"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-5">
                      {ALL_PERMISSIONS.map((p) => (
                        <label
                          key={p}
                          className="flex items-center gap-2 text-[11px] tracking-[0.1em] text-muted-foreground"
                        >
                          <Checkbox
                            checked={a.permissions.includes(p)}
                            onCheckedChange={async (v) => {
                              const next = v
                                ? [...a.permissions, p]
                                : a.permissions.filter((x) => x !== p);
                              await setPermsFn({ data: { userId: a.id, permissions: next } });
                              queryClient.invalidateQueries({ queryKey: ["admins"] });
                            }}
                          />
                          {PERMISSION_LABELS[p]}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {pagedAdmins.length === 0 ? (
                <p className="hairline-t pt-4 text-[12px] text-muted-foreground">暂无管理员</p>
              ) : null}
            </div>
            <Pager
              total={adminList.length}
              page={adminPage}
              size={adminSize}
              onPage={setAdminPage}
            />
          </Panel>
        </div>
      )}
    </Shell>
  );
}

function PageSizeSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-[11px] tracking-[0.16em] text-muted-foreground">
      每页
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="border-0 border-b bg-transparent py-1 text-[12px] focus:outline-none"
      >
        {PAGE_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      条
    </label>
  );
}

function Pager({
  total,
  page,
  size,
  onPage,
}: {
  total: number;
  page: number;
  size: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="mt-8 flex items-center justify-end gap-6 text-[11px] tracking-[0.16em] text-muted-foreground">
      <button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="hover:text-foreground disabled:opacity-30"
      >
        上一页
      </button>
      <span>
        {page} / {pages}
      </span>
      <button
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        className="hover:text-foreground disabled:opacity-30"
      >
        下一页
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `f-${label.replace(/[^\w一-龥]/g, "").slice(0, 8)}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[11px] tracking-[0.2em] text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
