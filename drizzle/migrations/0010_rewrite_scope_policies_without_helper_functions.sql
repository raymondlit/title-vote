-- 与其他表的策略保持一致：用内联子查询代替 is_superadmin/is_school_admin/current_school_id，
-- 避免 authenticated 角色因缺少函数 EXECUTE 权限而 403。

DROP POLICY IF EXISTS ogrb_read ON public.offline_group_result_batches;
CREATE POLICY ogrb_read ON public.offline_group_result_batches
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
  OR school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
);

DROP POLICY IF EXISTS ogrb_write ON public.offline_group_result_batches;
CREATE POLICY ogrb_write ON public.offline_group_result_batches
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
  OR (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
  OR (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
);

DROP POLICY IF EXISTS ogr_read ON public.offline_group_results;
CREATE POLICY ogr_read ON public.offline_group_results
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
  OR school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
);

DROP POLICY IF EXISTS ogr_write ON public.offline_group_results;
CREATE POLICY ogr_write ON public.offline_group_results
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
  OR (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
  OR (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
);

DROP POLICY IF EXISTS va_read ON public.vote_archives;
CREATE POLICY va_read ON public.vote_archives
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
  OR (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
);

DROP POLICY IF EXISTS va_insert ON public.vote_archives;
CREATE POLICY va_insert ON public.vote_archives
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
  OR (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
);

DROP POLICY IF EXISTS va_delete ON public.vote_archives;
CREATE POLICY va_delete ON public.vote_archives
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
  OR (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
);