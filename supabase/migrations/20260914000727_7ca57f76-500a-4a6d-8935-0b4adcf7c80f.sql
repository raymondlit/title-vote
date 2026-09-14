
CREATE OR REPLACE FUNCTION public.judge_school_id(_judge_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT j.school_id FROM public.judges j WHERE j.id = _judge_id
$$;
REVOKE ALL ON FUNCTION public.judge_school_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.judge_school_id(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.candidate_school_id(_candidate_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.school_id FROM public.candidates c WHERE c.id = _candidate_id
$$;
REVOKE ALL ON FUNCTION public.candidate_school_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_school_id(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS ballots_self_insert ON public.ballots;
CREATE POLICY ballots_self_insert ON public.ballots FOR INSERT TO authenticated
WITH CHECK (
  public.is_my_judge(judge_id)
  AND public.session_is_open(session_id)
  AND public.judge_school_id(judge_id) = public.session_school_id(session_id)
);

DROP POLICY IF EXISTS bi_self_insert ON public.ballot_items;
CREATE POLICY bi_self_insert ON public.ballot_items FOR INSERT TO authenticated
WITH CHECK (
  public.ballot_is_mine(ballot_id)
  AND public.candidate_school_id(candidate_id) = public.ballot_school_id(ballot_id)
);

CREATE OR REPLACE FUNCTION public.enforce_same_school()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid;
BEGIN
  IF TG_TABLE_NAME IN ('candidates','vote_sessions') THEN
    IF NEW.category_id IS NOT NULL THEN
      SELECT school_id INTO sid FROM public.review_categories WHERE id = NEW.category_id;
      IF sid IS DISTINCT FROM NEW.school_id THEN
        RAISE EXCEPTION '评审类别不属于该学校';
      END IF;
    END IF;
  END IF;
  IF NEW.group_id IS NOT NULL THEN
    SELECT school_id INTO sid FROM public.subject_groups WHERE id = NEW.group_id;
    IF sid IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION '学科小组不属于该学校';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS candidates_same_school ON public.candidates;
CREATE TRIGGER candidates_same_school BEFORE INSERT OR UPDATE ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.enforce_same_school();

DROP TRIGGER IF EXISTS judges_same_school ON public.judges;
CREATE TRIGGER judges_same_school BEFORE INSERT OR UPDATE ON public.judges
FOR EACH ROW EXECUTE FUNCTION public.enforce_same_school();

DROP TRIGGER IF EXISTS vote_sessions_same_school ON public.vote_sessions;
CREATE TRIGGER vote_sessions_same_school BEFORE INSERT OR UPDATE ON public.vote_sessions
FOR EACH ROW EXECUTE FUNCTION public.enforce_same_school();
