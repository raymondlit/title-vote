ALTER TABLE public.schools
  DROP CONSTRAINT schools_font_scale_valid,
  ADD CONSTRAINT schools_font_scale_valid CHECK (
    font_scale IN ('small', 'standard', 'large')
    OR (font_scale ~ '^[0-9]{2,3}$' AND font_scale::integer BETWEEN 75 AND 300)
  );