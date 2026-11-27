import { supabase } from "@/integrations/supabase/client";

type SessionRow = { id: string; status: string; group_id: string | null; voter_scope: string | null };

/** Sessions visible to a judge, shared by login direct-entry and the vote list. */
export async function fetchJudgeSessions(userId: string) {
  const { data: judge } = await supabase
    .from("judges")
    .select("id, full_name, committee_role, group_id, school_id, is_committee_member")
    .eq("profile_id", userId)
    .maybeSingle();
  const [{ data: sessions }, { data: ballots }] = judge
    ? await Promise.all([
        supabase
          .from("vote_sessions")
          .select("id, title, status, opened_at, closed_at, category_id, group_id, voter_scope, round_number")
          .eq("school_id", judge.school_id)
          .in("status", ["open", "closed"])
          .is("archived_at", null)
          .order("created_at", { ascending: false }),
        supabase.from("ballots").select("session_id").eq("judge_id", judge.id),
      ])
    : [{ data: [] }, { data: [] as { session_id: string }[] }];
  const submitted = new Set((ballots ?? []).map((b) => b.session_id));
  const list = (sessions ?? []).filter((s) => visibleToJudge(s, judge));
  return { judge, list, submitted };
}

export function visibleToJudge(
  s: Pick<SessionRow, "group_id" | "voter_scope">,
  judge: { group_id: string | null; is_committee_member?: boolean | null } | null,
) {
  return s.voter_scope === "committee"
    ? !!judge?.is_committee_member
    : !s.group_id || s.voter_scope === "all" || s.group_id === judge?.group_id;
}

/** The only open session, when it is still unsubmitted; otherwise null (show the list). */
export function directSessionId(list: Pick<SessionRow, "id" | "status">[], submitted: Set<string>) {
  const open = list.filter((s) => s.status === "open");
  return open.length === 1 && !submitted.has(open[0]!.id) ? open[0]!.id : null;
}
