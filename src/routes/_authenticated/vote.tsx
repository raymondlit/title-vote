import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { JUDGE_NAV } from "@/components/judgeNav";
import { useSession, useSchool } from "@/lib/session";
import { BallotDelivery } from "@/components/BallotDelivery";

export const Route = createFileRoute("/_authenticated/vote")({
  component: VoteLayout,
});

function VoteLayout() {
  const session = useSession();
  const school = useSchool(session.data?.schoolId);
  const nav = school.data?.allow_judge_password_change
    ? [...JUDGE_NAV, { to: "/vote/password", label: "修改密码" }]
    : JUDGE_NAV;

  return (
    <Shell nav={nav} judgeView>
      <BallotDelivery userId={session.data?.userId} email={session.data?.email}><Outlet /></BallotDelivery>
    </Shell>
  );
}
