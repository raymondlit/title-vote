import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { pickVotingRule } from "@/lib/voteRules";

const choiceEnum = z.enum(["recommend", "not_recommend", "abstain"]);

export const submitBallot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        choices: z
          .array(z.object({ candidateId: z.string().uuid(), choice: choiceEnum }))
          .max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: judge } = await supabase
      .from("judges")
      .select("id, school_id, group_id")
      .eq("profile_id", context.userId)
      .maybeSingle();
    if (!judge) throw new Error("当前账号不是评委");

    const { data: session } = await supabase
      .from("vote_sessions")
      .select("id, school_id, category_id, group_id, status, voter_scope")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session || session.school_id !== judge.school_id) throw new Error("投票不存在");

    const { data: school } = await supabase
      .from("schools")
      .select("vote_label_recommend")
      .eq("id", session.school_id)
      .maybeSingle();
    const labelRecommend = school?.vote_label_recommend?.trim() || "推荐";
    if (session.status !== "open") throw new Error("该场投票尚未开始或已结束");
    if (
      session.group_id &&
      session.voter_scope !== "all" &&
      session.group_id !== judge.group_id
    ) {
      throw new Error("您不在本场投票的评委范围内");
    }


    const { data: existing } = await supabase
      .from("ballots")
      .select("id")
      .eq("session_id", session.id)
      .eq("judge_id", judge.id)
      .maybeSingle();
    if (existing) throw new Error("您已提交过本场投票，不能重复提交");

    let candQuery = supabase.from("candidates").select("id").eq("school_id", session.school_id);
    if (session.category_id) candQuery = candQuery.eq("category_id", session.category_id);
    if (session.group_id) candQuery = candQuery.eq("group_id", session.group_id);
    const { data: candidates } = await candQuery;
    const validIds = new Set((candidates ?? []).map((c) => c.id));

    for (const item of data.choices) {
      if (!validIds.has(item.candidateId)) throw new Error("提交的评审对象不在本场投票范围内");
    }
    const seen = new Set(data.choices.map((c) => c.candidateId));
    if (seen.size !== data.choices.length) throw new Error("同一评审对象重复提交");

    const { data: rules } = await supabase
      .from("voting_rules")
      .select("category_id, group_id, total_count, max_recommend, allow_abstain, require_all")
      .eq("school_id", session.school_id);
    const rule = pickVotingRule(rules, session.category_id, session.group_id);

    if (rule) {
      const recommends = data.choices.filter((c) => c.choice === "recommend").length;
      if (rule.max_recommend > 0 && recommends !== rule.max_recommend) {
        throw new Error(
          recommends > rule.max_recommend
            ? `本轮${labelRecommend}名额 ${rule.max_recommend} 人，已选 ${recommends} 人，超出 ${recommends - rule.max_recommend} 人，无法提交，请调整后再试`
            : `本轮须${labelRecommend} ${rule.max_recommend} 人，当前仅 ${recommends} 人，还差 ${rule.max_recommend - recommends} 人，无法提交`,
        );
      }
      if (!rule.allow_abstain && data.choices.some((c) => c.choice === "abstain")) {
        throw new Error("本场投票不允许弃权");
      }
      if (rule.require_all && seen.size !== validIds.size) {
        throw new Error("本场投票要求对每位评审对象表态");
      }
    }

    const { data: ballot, error: ballotError } = await supabase
      .from("ballots")
      .insert({ session_id: session.id, judge_id: judge.id })
      .select("id")
      .single();
    if (ballotError || !ballot) throw new Error(ballotError?.message ?? "提交失败");

    if (data.choices.length) {
      const { error: itemError } = await supabase.from("ballot_items").insert(
        data.choices.map((c) => ({
          ballot_id: ballot.id,
          candidate_id: c.candidateId,
          choice: c.choice,
        })),
      );
      if (itemError) throw new Error(itemError.message);
    }

    return { ballotId: ballot.id as string, submittedAt: new Date().toISOString() };
  });
