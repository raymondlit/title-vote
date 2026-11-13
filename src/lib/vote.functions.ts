import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sameBallot, type BallotChoice, type DeliveryResult } from "@/lib/ballotQueue";
import { fetchAllBallotItems } from "@/lib/rounds";

const choiceEnum = z.enum(["recommend", "not_recommend", "abstain"]);

/**
 * 评委提交选票。
 * 全部校验（身份、场次状态、评委范围、参评名单、多轮名额、投票规则）与写入
 * 都在数据库函数 submit_ballot 中一次完成：只需一次往返，任一步失败整张票回滚，
 * 并发重复提交由唯一约束兜底。函数以评委自己的身份运行，行级权限照常生效。
 */
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
  .handler(async ({ data, context }): Promise<DeliveryResult> => {
    // A lost response can mean the transaction committed. Always reconcile as
    // the caller, including after a concurrent duplicate or a closed session.
    async function existing(): Promise<DeliveryResult | null> {
      const { data: judge, error: judgeError } = await context.supabase.from("judges")
        .select("id").eq("profile_id", context.userId).maybeSingle();
      if (judgeError) throw judgeError;
      if (!judge) return null;
      const { data: ballot, error } = await context.supabase.from("ballots")
        .select("id, submitted_at").eq("session_id", data.sessionId).eq("judge_id", judge.id).maybeSingle();
      if (error) throw error;
      if (!ballot) return null;
      const items = await fetchAllBallotItems(context.supabase, [ballot.id]);
      const stored = items.map(i => ({ candidateId: i.candidate_id, choice: i.choice })) as BallotChoice[];
      return sameBallot(data.choices, stored)
        ? { status: "accepted", ballotId: ballot.id, submittedAt: ballot.submitted_at }
        : { status: "rejected", message: "服务器已有不同内容的选票；本次未覆盖，请查看表决确认单" };
    }
    try {
    const previous = await existing();
    if (previous) return previous;
    const { data: result, error } = await context.supabase.rpc("submit_ballot", {
      _session_id: data.sessionId,
      _choices: data.choices,
    });
    if (error) {
      const committed = await existing();
      if (committed) return committed;
      return error.code === "P0001" || error.code === "42501"
        ? { status: "rejected", message: error.message || "选票未被接受，请检查场次与规则" }
        : { status: "retry", message: "暂时无法确认提交，选票已保留，将自动重试" };
    }
    const out = (result ?? {}) as { ballotId?: string; submittedAt?: string };
    if (!out.ballotId) return { status: "retry", message: "暂时无法确认提交，将自动核对重试" };
    return {
      status: "accepted",
      ballotId: out.ballotId,
      submittedAt: out.submittedAt ?? new Date().toISOString(),
    };
    } catch {
      return { status: "retry", message: "连接不稳定，选票已保留，将自动核对重试" };
    }
  });
