import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { JUDGE_NAV } from "@/components/judgeNav";

export const Route = createFileRoute("/_authenticated/vote")({
  component: () => (
    <Shell nav={JUDGE_NAV}>
      <Outlet />
    </Shell>
  ),
});
