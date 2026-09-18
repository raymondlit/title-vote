import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SessionInfo = {
  userId: string;
  email: string | null;
  fullName: string;
  username: string | null;
  schoolId: string | null;
  roles: string[];
  permissions: string[];
  isSuper: boolean;
  isAdmin: boolean;
  isJudge: boolean;
};

export async function fetchSession(): Promise<SessionInfo | null> {
  // 读取本地会话（无网络往返）；令牌有效性仍由数据库 RLS 校验。
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user ?? null;
  if (!user) return null;

  const [{ data: profile }, { data: roles }, { data: perms }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, username, school_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("admin_permissions").select("permission").eq("user_id", user.id),
  ]);

  const roleList = (roles ?? []).map((r) => r.role as string);
  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? "",
    username: profile?.username ?? null,
    schoolId: profile?.school_id ?? null,
    roles: roleList,
    permissions: (perms ?? []).map((p) => p.permission as string),
    isSuper: roleList.includes("superadmin"),
    isAdmin: roleList.includes("admin"),
    isJudge: roleList.includes("judge"),
  };
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useSchool(schoolId: string | null | undefined) {
  return useQuery({
    queryKey: ["school", schoolId],
    enabled: !!schoolId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("*").eq("id", schoolId!).maybeSingle();
      return data;
    },
  });
}
