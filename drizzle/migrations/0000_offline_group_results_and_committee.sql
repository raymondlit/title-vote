CREATE TABLE public.offline_group_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.review_categories(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.subject_groups(id) ON DELETE SET NULL,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  is_recommended boolean NOT NULL DEFAULT false,
  agree_votes integer NOT NULL DEFAULT 0,
  total_votes integer NOT NULL DEFAULT 0,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offline_group_results TO authenticated;
GRANT ALL ON public.offline_group_results TO service_role;

ALTER TABLE public.offline_group_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY ogr_read ON public.offline_group_results
  FOR SELECT TO authenticated
  USING (public.is_superadmin() OR school_id = public.current_school_id());

CREATE POLICY ogr_write ON public.offline_group_results
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR public.is_school_admin(school_id))
  WITH CHECK (public.is_superadmin() OR public.is_school_admin(school_id));

ALTER TABLE public.judges ADD COLUMN IF NOT EXISTS is_committee_member boolean NOT NULL DEFAULT false;

ALTER TABLE public.vote_sessions DROP CONSTRAINT IF EXISTS vote_sessions_voter_scope_check;
ALTER TABLE public.vote_sessions ADD CONSTRAINT vote_sessions_voter_scope_check
  CHECK (voter_scope = ANY (ARRAY['group'::text, 'all'::text, 'committee'::text]));