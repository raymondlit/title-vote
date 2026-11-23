CREATE OR REPLACE FUNCTION public.get_session_summary(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.vote_sessions s WHERE s.id = _session_id AND (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
      OR (s.school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
          AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
    )
  ) THEN
    RAISE EXCEPTION '无权查看本场计票结果' USING ERRCODE = '42501';
  END IF;
  WITH session_ballots AS MATERIALIZED (
    SELECT id, judge_id, submitted_at FROM public.ballots WHERE session_id = _session_id
  ), counts AS (
    SELECT i.candidate_id,
      count(*) FILTER (WHERE i.choice = 'recommend') AS recommend,
      count(*) FILTER (WHERE i.choice = 'not_recommend') AS not_recommend,
      count(*) FILTER (WHERE i.choice = 'abstain') AS abstain
    FROM session_ballots b
    CROSS JOIN LATERAL (
      SELECT candidate_id, choice FROM public.ballot_items
      WHERE ballot_id = b.id OFFSET 0
    ) i
    GROUP BY i.candidate_id
  )
  SELECT jsonb_build_object(
    'counts', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.candidate_id) FROM counts c), '[]'::jsonb),
    'ballots', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM session_ballots b), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_session_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_session_summary(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.get_session_summary(uuid) IS 'Admin-only, RLS-scoped totals. Parameterized per-ballot item scans avoid evaluating nested RLS across unrelated sessions; OFFSET 0 preserves the lateral boundary.';