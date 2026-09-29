ALTER TABLE public.vote_archives
  ADD COLUMN category_id uuid REFERENCES public.review_categories(id) ON DELETE SET NULL,
  ADD COLUMN group_id uuid REFERENCES public.subject_groups(id) ON DELETE SET NULL;

UPDATE public.vote_archives va
SET category_id = vs.category_id,
    group_id = vs.group_id
FROM public.vote_sessions vs
WHERE va.session_id = vs.id
  AND (va.category_id IS NULL OR va.group_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_vote_archives_school_created ON public.vote_archives (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vote_archives_category ON public.vote_archives (category_id);
CREATE INDEX IF NOT EXISTS idx_vote_archives_group ON public.vote_archives (group_id);