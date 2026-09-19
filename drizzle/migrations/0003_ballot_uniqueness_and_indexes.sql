DELETE FROM public.ballots a
USING public.ballots b
WHERE a.session_id = b.session_id
  AND a.judge_id = b.judge_id
  AND a.ctid > b.ctid;

ALTER TABLE public.ballots
  ADD CONSTRAINT ballots_session_judge_unique UNIQUE (session_id, judge_id);

CREATE INDEX IF NOT EXISTS idx_ballot_items_ballot ON public.ballot_items (ballot_id);
CREATE INDEX IF NOT EXISTS idx_ballots_session ON public.ballots (session_id);