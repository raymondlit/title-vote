CREATE TABLE public.offline_group_result_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.review_categories(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.subject_groups(id) ON DELETE SET NULL,
  row_count integer NOT NULL DEFAULT 0,
  recommended_count integer NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offline_group_result_batches TO authenticated;
GRANT ALL ON public.offline_group_result_batches TO service_role;

ALTER TABLE public.offline_group_result_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ogrb_read" ON public.offline_group_result_batches
  FOR SELECT TO authenticated
  USING (public.is_superadmin() OR school_id = public.current_school_id());

CREATE POLICY "ogrb_write" ON public.offline_group_result_batches
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR public.is_school_admin(school_id))
  WITH CHECK (public.is_superadmin() OR public.is_school_admin(school_id));

CREATE INDEX idx_ogrb_school_created ON public.offline_group_result_batches (school_id, created_at DESC);