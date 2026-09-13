import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shell, PageTitle, Panel } from "@/components/Shell";
import { ADMIN_NAV } from "@/components/adminNav";
import { useSession } from "@/lib/session";
import { PERMISSION_LABELS } from "@/lib/account";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "管理后台概览 — 职称评审推荐投票平台" },
      { name: "description", content: "查看本校评委、评审对象、类别与分组的配置进度。" },
      { property: "og:title", content: "管理后台概览 — 职称评审推荐投票平台" },
      { property: "og:description", content: "查看本校评委、评审对象、类别与分组的配置进度。" },
    ],
  }),
  component: AdminHome,
});

function AdminHome() {
  const { data: session } = useSession();
  const schoolId = session?.schoolId;

  const stats = useQuery({
    queryKey: ["admin-stats", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const [judges, candidates, categories, groups, rules] = await Promise.all([
        supabase.from("judges").select("id", { count: "exact", head: true }),
        supabase.from("candidates").select("id", { count: "exact", head: true }),
        supabase.from("review_categories").select("id", { count: "exact", head: true }),
        supabase.from("subject_groups").select("id", { count: "exact", head: true }),
        supabase.from("voting_rules").select("id", { count: "exact", head: true }),
      ]);
      return {
        judges: judges.count ?? 0,
        candidates: candidates.count ?? 0,
        categories: categories.count ?? 0,
        groups: groups.count ?? 0,
        rules: rules.count ?? 0,
      };
    },
  });

  const items = [
    { label: "评委", value: stats.data?.judges ?? 0 },
    { label: "评审对象", value: stats.data?.candidates ?? 0 },
    { label: "评审类别", value: stats.data?.categories ?? 0 },
    { label: "学科小组", value: stats.data?.groups ?? 0 },
    { label: "投票规则", value: stats.data?.rules ?? 0 },
  ];

  return (
    <Shell nav={ADMIN_NAV}>
      <PageTitle
        title="概览"
        description="按左侧顺序完成配置：界面配置 — 评委管理 — 类别与分组 — 评审对象 — 投票规则。"
      />

      <Panel>
        <div className="grid gap-10 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((i) => (
            <div key={i.label}>
              <div className="text-[28px] font-light tracking-[0.05em]">{i.value}</div>
              <div className="mt-2 text-[11px] tracking-[0.2em] text-muted-foreground">
                {i.label}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="mt-10">
        <h2 className="mb-6 text-[12px] tracking-[0.2em] text-muted-foreground">我的权限</h2>
        <div className="flex flex-wrap gap-6 text-[12px] tracking-[0.1em]">
          {(session?.permissions ?? []).length === 0 ? (
            <span className="text-muted-foreground">暂未分配权限，请联系超级用户</span>
          ) : (
            (session?.permissions ?? []).map((p) => <span key={p}>{PERMISSION_LABELS[p] ?? p}</span>)
          )}
        </div>
        <Link
          to="/admin/branding"
          className="mt-8 inline-block text-[11px] tracking-[0.2em] underline"
        >
          开始配置
        </Link>
      </Panel>
    </Shell>
  );
}
