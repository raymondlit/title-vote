ALTER TABLE public.vote_sessions
  ADD COLUMN IF NOT EXISTS voter_scope text NOT NULL DEFAULT 'group';
ALTER TABLE public.vote_sessions
  DROP CONSTRAINT IF EXISTS vote_sessions_voter_scope_check;
ALTER TABLE public.vote_sessions
  ADD CONSTRAINT vote_sessions_voter_scope_check CHECK (voter_scope IN ('group','all'));