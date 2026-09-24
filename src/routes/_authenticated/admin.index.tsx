import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shell, PageTitle, Panel } from "@/components/Shell";
import { ADMIN_NAV } from "@/components/adminNav";
import { useSession } from "@/lib/session";
import { PERMISSION_LABELS } from "@/lib/account";
import { ListSkeleton } from "@/components/DataState";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "评审进度看板 — 职称评审推荐投票平台" },
      { name: "description", content: "按流程查看本校评审配置与投票进度，一步步完成评审工作。" },
      { property: "og:title", content: "评审进度看板 — 职称评审推荐投票平台" },
      {
        property: "og:description",
        content: "按流程查看本校评审配置与投票进度，一步步完成评审工作。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminHome,
});

type Step = {
  key: string;
  index: string;
  label: string;
  to: string;
  hint: string;
  count: number;
  done: boolean;
  unit: string;
};

function AdminHome() {
  const { data: session } = useSession();
  const schoolId = session?.schoolId;

  const stats = useQuery({
    queryKey: ["admin-stats", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      // 一次请求取回全部统计（原为 10 次并发请求），RLS 仍按本校生效
      const { data, error } = await supabase.rpc("admin_dashboard_stats", {
        _school_id: schoolId!,
      });
      if (error) throw error;
      const d = (data ?? {}) as Record<string, number>;
      const n = (k: string) => Number(d[k] ?? 0);
      return {
        judges: n("judges"),
        candidates: n("candidates"),
        categories: n("categories"),
        groups: n("groups"),
        rules: n("rules"),
        offline: n("offline"),
        committee: n("committee"),
        sessions: n("sessions"),
        openSessions: n("openSessions"),
        ballots: n("ballots"),
      };
    },
  });

  const s = stats.data;
  const steps: Step[] = [
    {
      key: "branding",
      index: "一",
      label: "界面配置",
      to: "/admin/branding",
      hint: "设置校名、校徽、主题与登录地址",
      count: 0,
      unit: "",
      done: true,
    },
    {
      key: "judges",
      index: "二",
      label: "评委导入",
      to: "/admin/judges",
      hint: "下载模板导入或手动新增评委，打印密码本",
      count: s?.judges ?? 0,
      unit: "人",
      done: (s?.judges ?? 0) > 0,
    },
    {
      key: "groups",
      index: "三",
      label: "类别与分组",
      to: "/admin/groups",
      hint: "设置评审类别与学科小组",
      count: (s?.categories ?? 0) + (s?.groups ?? 0),
      unit: "项",
      done: (s?.categories ?? 0) > 0 && (s?.groups ?? 0) > 0,
    },
    {
      key: "candidates",
      index: "四",
      label: "评审对象导入",
      to: "/admin/candidates",
      hint: "导入参评人员并按类别、学科分组",
      count: s?.candidates ?? 0,
      unit: "人",
      done: (s?.candidates ?? 0) > 0,
    },
    {
      key: "rules",
      index: "五",
      label: "投票规则",
      to: "/admin/rules",
      hint: "设置参评总数、推荐名额与选项名称",
      count: s?.rules ?? 0,
      unit: "条",
      done: (s?.rules ?? 0) > 0,
    },
    {
      key: "offline",
      index: "六",
      label: "学科组线下推荐",
      to: "/admin/candidates",
      hint: "下载推荐表、线下评议后上传录入结果",
      count: s?.offline ?? 0,
      unit: "条",
      done: (s?.offline ?? 0) > 0,
    },
    {
      key: "committee",
      index: "七",
      label: "大评审委员会",
      to: "/admin/judges",
      hint: "从评委名单勾选委员并指定职务",
      count: s?.committee ?? 0,
      unit: "人",
      done: (s?.committee ?? 0) > 0,
    },
    {
      key: "sessions",
      index: "八",
      label: "投票场次与结果",
      to: "/admin/sessions",
      hint: "加载评审对象、开启投票、统计并打印确认单",
      count: s?.sessions ?? 0,
      unit: "场",
      done: (s?.sessions ?? 0) > 0,
    },
  ];

  const next = steps.find((step) => !step.done);

  return (
    <Shell nav={ADMIN_NAV}>
      <PageTitle
        title="评审进度看板"
        description="按下列顺序推进评审工作，每一步都可点击直达对应页面。"
      />

      <Panel className="mb-10">
        <div className="flex flex-wrap gap-x-12 gap-y-6">
          <Metric label="评委" value={s?.judges ?? 0} />
          <Metric label="评审对象" value={s?.candidates ?? 0} />
          <Metric label="委员会成员" value={s?.committee ?? 0} />
          <Metric label="进行中场次" value={s?.openSessions ?? 0} />
          <Metric label="已提交表决" value={s?.ballots ?? 0} />
        </div>
        {next ? (
          <p className="mt-8 text-[12px] leading-loose tracking-[0.12em] text-muted-foreground">
            下一步建议：{next.index}　{next.label} —— {next.hint}
            <Link to={next.to} className="ml-4 underline">
              前往
            </Link>
          </p>
        ) : (
          <p className="mt-8 text-[12px] tracking-[0.12em] text-muted-foreground">
            各项配置均已就绪，可在「投票场次」开启投票或在「投票结果」查看统计。
          </p>
        )}
      </Panel>

      <Panel className="mb-10">
        <h2 className="mb-6 text-[12px] tracking-[0.2em] text-muted-foreground">流程进度</h2>
        {stats.isLoading ? (
          <ListSkeleton rows={4} />
        ) : (
          <div className="grid gap-x-12 md:grid-cols-2">
            {steps.map((step) => (
              <Link
                key={step.key}
                to={step.to}
                className="hairline-t group flex items-start gap-5 py-4 transition-colors hover:bg-muted/40"
              >
                <span className="mt-[2px] w-6 shrink-0 text-[12px] tracking-[0.1em] text-muted-foreground">
                  {step.index}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-3">
                    <span className="text-[13px] tracking-[0.16em]">{step.label}</span>
                    {step.unit ? (
                      <span className="text-[11px] tracking-[0.14em] text-muted-foreground">
                        {step.count} {step.unit}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-2 block text-[11px] leading-loose tracking-[0.1em] text-muted-foreground">
                    {step.hint}
                  </span>
                </span>
                <span
                  className={`mt-[2px] shrink-0 text-[11px] tracking-[0.16em] ${
                    step.done ? "text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {step.done ? "已完成" : "待处理"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="mb-6 text-[12px] tracking-[0.2em] text-muted-foreground">我的权限</h2>
        <div className="flex flex-wrap gap-6 text-[12px] tracking-[0.1em]">
          {(session?.permissions ?? []).length === 0 ? (
            <span className="text-muted-foreground">暂未分配权限，请联系超级用户</span>
          ) : (
            (session?.permissions ?? []).map((p) => <span key={p}>{PERMISSION_LABELS[p] ?? p}</span>)
          )}
        </div>
      </Panel>
    </Shell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[28px] font-light tracking-[0.05em]">{value}</div>
      <div className="mt-2 text-[11px] tracking-[0.2em] text-muted-foreground">{label}</div>
    </div>
  );
}
