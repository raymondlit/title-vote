import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Only meeting-static metadata uses this policy; ballots/results remain live. */
export const METADATA_CACHE = {
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnMount: true,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;

export function categoriesQueryOptions(schoolId: string | null | undefined) {
  return queryOptions({
    ...METADATA_CACHE,
    queryKey: ["review_categories", schoolId ?? "all"],
    queryFn: async () => {
      let query = supabase.from("review_categories").select("id, name, school_id, sort_order, created_at").order("sort_order");
      if (schoolId) query = query.eq("school_id", schoolId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function groupsQueryOptions(schoolId: string | null | undefined) {
  return queryOptions({
    ...METADATA_CACHE,
    queryKey: ["subject_groups", schoolId ?? "all"],
    queryFn: async () => {
      let query = supabase.from("subject_groups").select("id, name, school_id, sort_order, leader_mode, created_at").order("sort_order");
      if (schoolId) query = query.eq("school_id", schoolId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}