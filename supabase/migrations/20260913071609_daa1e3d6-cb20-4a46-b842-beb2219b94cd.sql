CREATE TYPE public.vote_choice AS ENUM ('recommend','not_recommend','abstain');

CREATE TABLE public.vote_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.review_categories(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.subject_groups(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vote_sessions TO authenticated;
GRANT ALL ON public.vote_sessions TO service_role;
ALTER TABLE public.vote_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY vs_admin ON public.vote_sessions FOR ALL TO authenticated
  USING (is_school_admin(school_id) OR is_superadmin())
  WITH CHECK (is_school_admin(school_id) OR is_superadmin());
CREATE POLICY vs_read ON public.vote_sessions FOR SELECT TO authenticated
  USING (is_superadmin() OR (school_id = current_school_id() AND status IN ('open','closed')));

CREATE OR REPLACE FUNCTION public.is_my_judge(_judge_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.judges j WHERE j.id = _judge_id AND j.profile_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.is_my_judge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_my_judge(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.session_school_id(_session_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.school_id FROM public.vote_sessions s WHERE s.id = _session_id
$$;
REVOKE ALL ON FUNCTION public.session_school_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_school_id(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.session_is_open(_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.vote_sessions s WHERE s.id = _session_id AND s.status = 'open')
$$;
REVOKE ALL ON FUNCTION public.session_is_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_is_open(uuid) TO authenticated, service_role;

CREATE TABLE public.ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.vote_sessions(id) ON DELETE CASCADE,
  judge_id uuid NOT NULL REFERENCES public.judges(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, judge_id)
);
GRANT SELECT, INSERT ON public.ballots TO authenticated;
GRANT ALL ON public.ballots TO service_role;
ALTER TABLE public.ballots ENABLE ROW LEVEL SECURITY;
CREATE POLICY ballots_admin_read ON public.ballots FOR SELECT TO authenticated
  USING (is_superadmin() OR is_school_admin(session_school_id(session_id)));
CREATE POLICY ballots_self_read ON public.ballots FOR SELECT TO authenticated
  USING (is_my_judge(judge_id));
CREATE POLICY ballots_self_insert ON public.ballots FOR INSERT TO authenticated
  WITH CHECK (is_my_judge(judge_id) AND session_is_open(session_id));

CREATE OR REPLACE FUNCTION public.ballot_is_mine(_ballot_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ballots b JOIN public.judges j ON j.id = b.judge_id
    WHERE b.id = _ballot_id AND j.profile_id = auth.uid()
  )
$$;
REVOKE ALL ON FUNCTION public.ballot_is_mine(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ballot_is_mine(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ballot_school_id(_ballot_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.school_id FROM public.ballots b JOIN public.vote_sessions s ON s.id = b.session_id
  WHERE b.id = _ballot_id
$$;
REVOKE ALL ON FUNCTION public.ballot_school_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ballot_school_id(uuid) TO authenticated, service_role;

CREATE TABLE public.ballot_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ballot_id uuid NOT NULL REFERENCES public.ballots(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  choice public.vote_choice NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ballot_id, candidate_id)
);
GRANT SELECT, INSERT ON public.ballot_items TO authenticated;
GRANT ALL ON public.ballot_items TO service_role;
ALTER TABLE public.ballot_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY bi_admin_read ON public.ballot_items FOR SELECT TO authenticated
  USING (is_superadmin() OR is_school_admin(ballot_school_id(ballot_id)));
CREATE POLICY bi_self_read ON public.ballot_items FOR SELECT TO authenticated
  USING (ballot_is_mine(ballot_id));
CREATE POLICY bi_self_insert ON public.ballot_items FOR INSERT TO authenticated
  WITH CHECK (ballot_is_mine(ballot_id));

CREATE INDEX idx_ballots_session ON public.ballots(session_id);
CREATE INDEX idx_ballot_items_ballot ON public.ballot_items(ballot_id);
CREATE INDEX idx_vote_sessions_school ON public.vote_sessions(school_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_vote_sessions_updated_at BEFORE UPDATE ON public.vote_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();