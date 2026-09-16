ALTER TABLE public.schools
  ADD COLUMN font_family text NOT NULL DEFAULT 'noto',
  ADD COLUMN font_scale text NOT NULL DEFAULT 'standard',
  ADD COLUMN color_scheme text NOT NULL DEFAULT 'minimal',
  ADD COLUMN display_mode text NOT NULL DEFAULT 'light',
  ADD COLUMN layout_density text NOT NULL DEFAULT 'standard';

ALTER TABLE public.schools
  ADD CONSTRAINT schools_font_family_valid CHECK (font_family IN ('noto', 'system', 'serif')),
  ADD CONSTRAINT schools_font_scale_valid CHECK (font_scale IN ('small', 'standard', 'large')),
  ADD CONSTRAINT schools_color_scheme_valid CHECK (color_scheme IN ('minimal', 'ocean', 'forest', 'burgundy', 'custom')),
  ADD CONSTRAINT schools_display_mode_valid CHECK (display_mode IN ('light', 'dark', 'system')),
  ADD CONSTRAINT schools_layout_density_valid CHECK (layout_density IN ('compact', 'standard', 'spacious'));

GRANT SELECT (font_family, font_scale, color_scheme, display_mode, layout_density) ON public.schools TO anon;
GRANT SELECT (font_family, font_scale, color_scheme, display_mode, layout_density) ON public.schools TO authenticated;
GRANT UPDATE (font_family, font_scale, color_scheme, display_mode, layout_density) ON public.schools TO authenticated;