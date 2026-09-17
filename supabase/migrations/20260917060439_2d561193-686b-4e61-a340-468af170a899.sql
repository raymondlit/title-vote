ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS judge_password_length integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS judge_password_charset text NOT NULL DEFAULT 'alnum_mixed';

ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_judge_password_length_check;
ALTER TABLE public.schools ADD CONSTRAINT schools_judge_password_length_check CHECK (judge_password_length BETWEEN 4 AND 32);
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_judge_password_charset_check;
ALTER TABLE public.schools ADD CONSTRAINT schools_judge_password_charset_check CHECK (judge_password_charset IN ('digits','letters','letters_mixed','alnum','alnum_mixed','full'));