import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { directSessionId, fetchJudgeSessions } from "@/lib/judgeSessions";
import { PageTitle, Panel } from "@/components/Shell";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/vote/")({
  head: () => ({ meta: [
    { title: "我的投票 — 职称评审推荐投票平台" },
    { name: "description", content: "查看开放的职称评审场次及已提交的表决确认单。" },
    { property: "og:title", content: "我的投票 — 职称评审推荐投票平台" },
    { property: "og:description", content: "查看开放的职称评审场次及已提交的表决确认单。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
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
    queryFn: () => fetchJudgeSessions(session!.userId),
  });

  const navigate = useNavigate();
  const directId = data ? directSessionId(data.list, data.submitted) : null;
  useEffect(() => {
    if (!directId) return;
    const key = `vote-direct:${directId}`;
    if (sessionStorage.getItem(key)) return; // 只直通一次，返回列表后不再跳
    sessionStorage.setItem(key, "1");
    navigate({ to: "/vote/$sessionId", params: { sessionId: directId }, replace: false });
  }, [directId, navigate]);

  if (isLoading || !session?.userId) {
    return (
      <>
        <div className="mb-10 space-y-3">
          <div className="h-5 w-32 animate-pulse bg-muted" />
          <div className="h-3 w-64 animate-pulse bg-muted/70" />
        </div>
        <Panel className="p-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="hairline-b px-8 py-6 last:border-b-0">
              <div className="h-3.5 w-56 animate-pulse bg-muted" />
              <div className="mt-3 h-2.5 w-32 animate-pulse bg-muted/70" />
            </div>
          ))}
        </Panel>
      </>
    );
  }

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
