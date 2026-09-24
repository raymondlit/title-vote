CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(_school_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'judges', (SELECT count(*) FROM judges WHERE school_id = _school_id),
    'committee', (SELECT count(*) FROM judges WHERE school_id = _school_id AND is_committee_member),
    'candidates', (SELECT count(*) FROM candidates WHERE school_id = _school_id),
    'categories', (SELECT count(*) FROM review_categories WHERE school_id = _school_id),
    'groups', (SELECT count(*) FROM subject_groups WHERE school_id = _school_id),
    'rules', (SELECT count(*) FROM voting_rules WHERE school_id = _school_id),
    'offline', (SELECT count(*) FROM offline_group_results WHERE school_id = _school_id),
    'sessions', (SELECT count(*) FROM vote_sessions WHERE school_id = _school_id),
    'openSessions', (SELECT count(*) FROM vote_sessions WHERE school_id = _school_id AND status = 'open'),
    'ballots', (SELECT count(*) FROM ballots b JOIN vote_sessions v ON v.id = b.session_id WHERE v.school_id = _school_id)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(uuid) TO authenticated;