ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
WITH r AS (SELECT id, row_number() OVER (PARTITION BY school_id, category_id ORDER BY created_at, full_name) AS rn FROM public.candidates)
UPDATE public.candidates c SET sort_order = r.rn FROM r WHERE r.id = c.id;
CREATE INDEX IF NOT EXISTS candidates_sort_idx ON public.candidates (school_id, category_id, sort_order);