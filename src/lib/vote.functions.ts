import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("submit_ballot", {
      _session_id: data.sessionId,
      _choices: data.choices,
    });
    if (error) throw new Error(error.message || "提交失败，请稍后重试");
    const out = (result ?? {}) as { ballotId?: string; submittedAt?: string };
    if (!out.ballotId) throw new Error("提交失败，请稍后重试");
    return {
      ballotId: out.ballotId,
      submittedAt: out.submittedAt ?? new Date().toISOString(),
    };
  });
