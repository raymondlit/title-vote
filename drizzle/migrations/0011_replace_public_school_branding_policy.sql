DROP POLICY IF EXISTS schools_public_branding_read ON public.schools;

CREATE OR REPLACE FUNCTION public.get_school_branding(_slug text)
RETURNS TABLE(name text, subtitle text, logo_url text, accent_color text, font_family text, font_scale text, color_scheme text, display_mode text, layout_density text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.name, s.subtitle, s.logo_url, s.accent_color, s.font_family, s.font_scale, s.color_scheme, s.display_mode, s.layout_density
  FROM public.schools s WHERE s.slug = _slug LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_school_branding(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_branding(text) TO anon, authenticated;