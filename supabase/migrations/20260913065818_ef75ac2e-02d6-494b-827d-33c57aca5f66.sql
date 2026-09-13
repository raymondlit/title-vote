-- 1) judges: restrict sensitive contact fields to admins; judges can read own row
DROP POLICY IF EXISTS judges_read ON public.judges;
CREATE POLICY judges_read ON public.judges
  FOR SELECT TO authenticated
  USING (
    public.is_school_admin(school_id)
    OR public.is_superadmin()
    OR profile_id = auth.uid()
  );

-- 2) harden security definer helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- callers may only probe their own roles; privileged contexts (service_role,
  -- policy evaluation on behalf of the current user) still work.
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid() AND role = 'superadmin'
     )
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_school_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_school_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_school_admin(uuid) TO authenticated, service_role;

-- 3) storage policies for the private 'branding' bucket
DROP POLICY IF EXISTS branding_admin_read ON storage.objects;
DROP POLICY IF EXISTS branding_admin_insert ON storage.objects;
DROP POLICY IF EXISTS branding_admin_update ON storage.objects;
DROP POLICY IF EXISTS branding_admin_delete ON storage.objects;

CREATE POLICY branding_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'branding'
    AND (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY branding_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY branding_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    bucket_id = 'branding'
    AND (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY branding_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'))
  );