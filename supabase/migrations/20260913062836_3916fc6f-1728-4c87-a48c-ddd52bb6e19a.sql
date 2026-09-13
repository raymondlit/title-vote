REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_school_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_superadmin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_school_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_school_admin(uuid) TO authenticated, service_role;