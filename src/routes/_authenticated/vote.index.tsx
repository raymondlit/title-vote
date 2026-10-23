import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageTitle, Panel } from "@/components/Shell";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/vote/")({
  component: VoteList,
});

const STATUS_LABEL: Record<string, string> = {
  open: "进行中",
  closed: "已结束",
  draft: "未开始",
};

function VoteList() {
  const { data: session } = useSession();

  const { data, isLoading } = useQuery({
    queryKey: ["judge-sessions", session?.userId],
    enabled: !!session?.userId,
    queryFn: async () => {
      const { data: judge } = await supabase
        .from("judges")
        .select("id, full_name, committee_role, group_id, school_id, is_committee_member")
        .eq("profile_id", session!.userId)
        .maybeSingle();

      const { data: sessions } = judge
        ? await supabase
            .from("vote_sessions")
            .select(
              "id, title, status, opened_at, closed_at, category_id, group_id, voter_scope, round_number",
            )
            .eq("school_id", judge.school_id)
            .in("status", ["open", "closed"])
            .is("archived_at", null)
            .order("created_at", { ascending: false })
        : { data: [] };


      const { data: ballots } = judge
        ? await supabase.from("ballots").select("session_id").eq("judge_id", judge.id)
        : { data: [] as { session_id: string }[] };

      const submitted = new Set((ballots ?? []).map((b) => b.session_id));
      const list = (sessions ?? []).filter((s) =>
        s.voter_scope === "committee"
          ? !!(judge as { is_committee_member?: boolean } | null)?.is_committee_member
          : !s.group_id || s.voter_scope === "all" || s.group_id === judge?.group_id,
      );

      return { judge, list, submitted };
    },
  });

  if (isLoading) return <div />;

  if (!data?.judge) {
    return (
      <>
        <PageTitle title="我的投票" />
        <Panel>
          <p className="text-[12px] tracking-[0.1em] text-muted-foreground">
            当前账号未关联评委身份，请联系本校管理员。
          </p>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="我的投票"
        description={`${data.judge.full_name}，以下为向您开放的评审推荐投票。`}
      />
      <Panel className="p-0">
        {data.list.length === 0 ? (
          <p className="p-8 text-[12px] tracking-[0.1em] text-muted-foreground">
            暂无进行中的投票。
          </p>
        ) : (
          <ul>
            {data.list.map((s) => {
              const done = data.submitted.has(s.id);
              return (
                <li key={s.id} className="hairline-b last:border-b-0">
                  <Link
                    to="/vote/$sessionId"
                    params={{ sessionId: s.id }}
                    className="flex items-center justify-between px-8 py-6 transition-colors hover:bg-background"
                  >
                    <div>
                      <div className="text-[13px] tracking-[0.12em] text-foreground">{s.title}</div>
                      <div className="mt-2 text-[11px] tracking-[0.16em] text-muted-foreground">
                        {`第 ${s.round_number ?? 1} 轮 · `}
                        {STATUS_LABEL[s.status] ?? s.status}
                        {done ? " · 已提交" : s.status === "open" ? " · 待投票" : ""}
                      </div>
                    </div>
                    <span className="text-[11px] tracking-[0.2em] text-muted-foreground">
                      {done ? "查看确认单" : "进入"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
