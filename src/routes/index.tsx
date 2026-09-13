import { createFileRoute } from "@tanstack/react-router";
import { LoginPanel } from "@/components/LoginPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "登录 — 职称评审推荐投票平台" },
      { name: "description", content: "高校职称评审推荐投票平台，管理员与评委统一登录入口。" },
      { property: "og:title", content: "登录 — 职称评审推荐投票平台" },
      {
        property: "og:description",
        content: "高校职称评审推荐投票平台，管理员与评委统一登录入口。",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <LoginPanel
      title="职称评审推荐投票平台"
      subtitle="管理员与评委统一入口"
      hint="账号由学校管理员发放。如忘记密码，请联系本校管理员重置。"
    />
  );
}
