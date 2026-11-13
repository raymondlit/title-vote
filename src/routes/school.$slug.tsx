import { createFileRoute, useHydrated } from "@tanstack/react-router";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SchoolLogin,
});

function SchoolLogin() {
  const { slug } = Route.useParams();
  const hydrated = useHydrated();
  const { data: school, isLoading } = useQuery({
    queryKey: ["school-by-slug", slug],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_school_branding", { _slug: slug });
      const row = data?.[0] ?? null;
      try {
        if (row) localStorage.setItem(`branding:${slug}`, JSON.stringify(row));
      } catch {}
      return row;
    },
    // 有缓存时立即渲染，后台静默校准
    placeholderData: () => {
      if (!hydrated) return undefined;
      try {
        const raw = localStorage.getItem(`branding:${slug}`);
        return raw ? JSON.parse(raw) : undefined;
      } catch {
        return undefined;
      }
    },
    staleTime: 5 * 60_000,
  });
  void isLoading;

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
