CREATE OR REPLACE FUNCTION public.get_current_account()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
 SELECT jsonb_build_object(
  'userId', auth.uid(),
  'fullName', COALESCE((SELECT full_name FROM public.profiles WHERE id = auth.uid()), ''),
  'username', (SELECT username FROM public.profiles WHERE id = auth.uid()),
  'schoolId', (SELECT school_id FROM public.profiles WHERE id = auth.uid()),
  'roles', COALESCE((SELECT jsonb_agg(role::text ORDER BY role::text) FROM public.user_roles WHERE user_id = auth.uid()), '[]'::jsonb),
  'permissions', COALESCE((SELECT jsonb_agg(permission::text ORDER BY permission::text) FROM public.admin_permissions WHERE user_id = auth.uid()), '[]'::jsonb)
 ) WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_current_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_account() TO authenticated, service_role;
COMMENT ON FUNCTION public.get_current_account() IS 'Caller-only account snapshot; SECURITY INVOKER preserves all existing RLS policies.';