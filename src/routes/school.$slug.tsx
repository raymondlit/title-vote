import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LoginPanel } from "@/components/LoginPanel";

export const Route = createFileRoute("/school/$slug")({
  head: () => ({
    meta: [
      { title: "学校登录 — 职称评审推荐投票平台" },
      { name: "description", content: "本校职称评审推荐投票的评委与管理员登录入口。" },
      { property: "og:title", content: "学校登录 — 职称评审推荐投票平台" },
      { property: "og:description", content: "本校职称评审推荐投票的评委与管理员登录入口。" },
    ],
  }),
  component: SchoolLogin,
});

function SchoolLogin() {
  const { slug } = Route.useParams();
  const { data: school, isLoading } = useQuery({
    queryKey: ["school-by-slug", slug],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_school_branding", { _slug: slug });
      return data?.[0] ?? null;
    },
  });

  if (isLoading) return <div className="min-h-screen" />;

  return (
    <LoginPanel
      title={school?.name ?? "职称评审推荐投票平台"}
      subtitle={school?.subtitle ?? "职称评审推荐投票"}
      logoUrl={school?.logo_url ?? null}
      accent={school?.accent_color ?? null}
      appearance={school}
      hint="账号由本校管理员发放。如忘记密码，请联系管理员重置。"
    />
  );
}
