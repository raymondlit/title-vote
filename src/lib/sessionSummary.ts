import { z } from "zod";

export const sessionSummarySchema = z.object({
  counts: z.array(z.object({
    candidate_id: z.string().uuid(),
    recommend: z.number().int().nonnegative(),
    not_recommend: z.number().int().nonnegative(),
    abstain: z.number().int().nonnegative(),
  })),
  ballots: z.array(z.object({ id: z.string().uuid(), judge_id: z.string().uuid(), submitted_at: z.string() })),
});

export function applySessionCounts<T extends { id: string }>(rows: T[], summary: z.infer<typeof sessionSummarySchema>) {
  const counts = new Map(summary.counts.map(c => [c.candidate_id, c]));
  return rows.map(row => {
    const c = counts.get(row.id);
    return { ...row, recommend: c?.recommend ?? 0, not_recommend: c?.not_recommend ?? 0, abstain: c?.abstain ?? 0 };
  });
}