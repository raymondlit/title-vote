ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS vote_label_recommend text NOT NULL DEFAULT '推荐',
  ADD COLUMN IF NOT EXISTS vote_label_not_recommend text NOT NULL DEFAULT '不推荐';