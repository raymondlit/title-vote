import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // 使用本地会话判断，避免每次进入后台都等待一次鉴权网络请求；
    // 真实权限仍由数据库 RLS 与服务端函数校验。
    const { data, error } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (error || !user) throw redirect({ to: "/" });
    return { user };
  },
  component: () => <Outlet />,
});
