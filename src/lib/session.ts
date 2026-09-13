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
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ data: profile }, { data: roles }, { data: perms }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
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
  return useQuery({ queryKey: ["session"], queryFn: fetchSession, staleTime: 30_000 });
}

export function useSchool(schoolId: string | null | undefined) {
  return useQuery({
    queryKey: ["school", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("*").eq("id", schoolId!).maybeSingle();
      return data;
    },
  });
}
