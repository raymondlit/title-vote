import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { METADATA_CACHE } from "@/lib/metadata";
import { parseAccountSnapshot } from "@/lib/accountSnapshot";

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

export async function fetchSession(
  knownUser?: { id: string; email?: string | null } | null,
): Promise<SessionInfo | null> {
  // 登录时直接复用登录返回的用户；否则读取本地会话（无网络往返）。
  // 令牌有效性仍由数据库 RLS 校验。
  let user = knownUser ?? null;
  if (!user) {
    const { data: sessionData } = await supabase.auth.getSession();
    user = sessionData.session?.user ?? null;
  }
  if (!user) return null;

  // Single caller-scoped read; SQL runs as this user and preserves existing RLS.
  const { data, error } = await supabase.rpc("get_current_account");
  if (error) throw error;
  return parseAccountSnapshot(data, user);
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => fetchSession(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useSchool(schoolId: string | null | undefined) {
  return useQuery({
    queryKey: ["school", schoolId],
    enabled: !!schoolId,
    ...METADATA_CACHE,
    queryFn: async () => {
      if (!schoolId) return null;
      const { data, error } = await supabase.from("schools").select("*").eq("id", schoolId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
