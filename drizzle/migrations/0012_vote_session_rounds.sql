ALTER TABLE public.vote_sessions
  ADD COLUMN IF NOT EXISTS round_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_session_id uuid REFERENCES public.vote_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS candidate_ids uuid[],
  ADD COLUMN IF NOT EXISTS passed_candidate_ids uuid[],
  ADD COLUMN IF NOT EXISTS max_recommend integer;

COMMENT ON COLUMN public.vote_sessions.round_number IS '轮次序号，首轮为 1';
COMMENT ON COLUMN public.vote_sessions.parent_session_id IS '上一轮场次';
COMMENT ON COLUMN public.vote_sessions.candidate_ids IS '本轮参评人员；为空时按评审类别/学科组/大评审范围确定';
COMMENT ON COLUMN public.vote_sessions.passed_candidate_ids IS '管理员确认的本轮通过名单；为空表示尚未确认';
COMMENT ON COLUMN public.vote_sessions.max_recommend IS '本轮推荐名额，覆盖投票规则中的名额';

CREATE INDEX IF NOT EXISTS vote_sessions_parent_idx ON public.vote_sessions(parent_session_id);