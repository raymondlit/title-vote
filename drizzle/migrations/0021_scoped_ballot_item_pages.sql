CREATE OR REPLACE FUNCTION public.get_ballot_items_page(_ballot_ids uuid[], _offset integer DEFAULT 0)
RETURNS TABLE(id uuid, ballot_id uuid, candidate_id uuid, choice public.vote_choice)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '请先登录' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(cardinality(_ballot_ids), 0) > 50 OR _offset IS NULL OR _offset < 0 THEN
    RAISE EXCEPTION '选票分页参数有误';
  END IF;
  RETURN QUERY
  WITH scoped_ballots AS MATERIALIZED (
    SELECT b.id FROM public.ballots b WHERE b.id = ANY(_ballot_ids)
  )
  SELECT i.id, b.id, i.candidate_id, i.choice
  FROM scoped_ballots b
  CROSS JOIN LATERAL (
    SELECT bi.id, bi.candidate_id, bi.choice FROM public.ballot_items bi
    WHERE bi.ballot_id = b.id OFFSET 0
  ) i
  ORDER BY i.id
  LIMIT 1000 OFFSET _offset;
END;
$$;
REVOKE ALL ON FUNCTION public.get_ballot_items_page(uuid[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ballot_items_page(uuid[], integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.get_ballot_items_page(uuid[], integer) IS 'RLS-preserving paged ballot details. Materialized visible ballot IDs and per-ballot OFFSET 0 boundary prevent unrelated nested-policy scans during confirmation and retry reconciliation.';