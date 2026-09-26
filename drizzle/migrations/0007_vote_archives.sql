CREATE TABLE public.vote_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid,
  title text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.vote_archives TO authenticated;
GRANT ALL ON public.vote_archives TO service_role;
ALTER TABLE public.vote_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY va_read ON public.vote_archives FOR SELECT TO authenticated USING (public.is_superadmin() OR public.is_school_admin(school_id));
CREATE POLICY va_insert ON public.vote_archives FOR INSERT TO authenticated WITH CHECK (public.is_superadmin() OR public.is_school_admin(school_id));
CREATE POLICY va_delete ON public.vote_archives FOR DELETE TO authenticated USING (public.is_superadmin() OR public.is_school_admin(school_id));
CREATE INDEX idx_vote_archives_school ON public.vote_archives(school_id, created_at DESC);