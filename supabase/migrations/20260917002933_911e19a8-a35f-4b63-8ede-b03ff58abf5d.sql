ALTER TABLE public.schools
  DROP CONSTRAINT schools_font_family_valid,
  DROP CONSTRAINT schools_font_scale_valid,
  DROP CONSTRAINT schools_color_scheme_valid;

ALTER TABLE public.schools
  ADD CONSTRAINT schools_font_family_valid CHECK (font_family IN ('noto', 'system', 'serif', 'source-serif', 'kai', 'fangsong', 'heiti', 'rounded', 'elegant', 'mono')),
  ADD CONSTRAINT schools_font_scale_valid CHECK (
    font_scale IN ('small', 'standard', 'large')
    OR (font_scale ~ '^[0-9]{2,3}$' AND font_scale::integer BETWEEN 75 AND 150)
  ),
  ADD CONSTRAINT schools_color_scheme_valid CHECK (color_scheme IN ('minimal', 'ocean', 'forest', 'burgundy', 'jade', 'sky', 'amber', 'rose', 'plum', 'indigo', 'custom'));