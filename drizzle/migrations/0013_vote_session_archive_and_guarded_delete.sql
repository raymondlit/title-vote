ALTER TABLE public.vote_sessions ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.vote_sessions ADD COLUMN IF NOT EXISTS archived_by uuid;
CREATE INDEX IF NOT EXISTS vote_sessions_school_archived_idx ON public.vote_sessions (school_id, archived_at);

-- 管理员不能在浏览器端直接删除投票场次：删除必须经服务端密码核验
DROP POLICY IF EXISTS vs_admin ON public.vote_sessions;

CREATE POLICY vs_admin_select ON public.vote_sessions FOR SELECT TO authenticated
USING (
  ((school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid()))
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'::app_role)
);

CREATE POLICY vs_admin_insert ON public.vote_sessions FOR INSERT TO authenticated
WITH CHECK (
  ((school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid()))
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'::app_role)
);

CREATE POLICY vs_admin_update ON public.vote_sessions FOR UPDATE TO authenticated
USING (
  ((school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid()))
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'::app_role)
)
WITH CHECK (
  ((school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid()))
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'::app_role)
);

REVOKE DELETE ON public.vote_sessions FROM authenticated;
REVOKE DELETE ON public.vote_sessions FROM anon;

-- 评委端看不到已归档场次
DROP POLICY IF EXISTS vs_read ON public.vote_sessions;
CREATE POLICY vs_read ON public.vote_sessions FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'::app_role)
  OR ((school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid()))
      AND status = ANY (ARRAY['open'::text, 'closed'::text])
      AND archived_at IS NULL)
);

-- 已归档场次不再接受提交
DROP POLICY IF EXISTS ballots_self_insert ON public.ballots;
CREATE POLICY ballots_self_insert ON public.ballots FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.judges j WHERE j.id = ballots.judge_id AND j.profile_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.vote_sessions s WHERE s.id = ballots.session_id AND s.status = 'open'::text AND s.archived_at IS NULL)
  AND (SELECT j.school_id FROM public.judges j WHERE j.id = ballots.judge_id) = (SELECT s.school_id FROM public.vote_sessions s WHERE s.id = ballots.session_id)
);