CREATE TABLE public.judge_credentials (
  judge_id uuid PRIMARY KEY REFERENCES public.judges(id) ON DELETE CASCADE,
  current_password text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.judge_credentials TO service_role;
ALTER TABLE public.judge_credentials ENABLE ROW LEVEL SECURITY;

INSERT INTO public.judge_credentials (judge_id, current_password)
SELECT id, initial_password
FROM public.judges
WHERE initial_password IS NOT NULL
ON CONFLICT (judge_id) DO UPDATE
SET current_password = EXCLUDED.current_password,
    updated_at = now();

ALTER TABLE public.judges DROP COLUMN initial_password;

DROP POLICY IF EXISTS roles_super_read ON public.user_roles;

DROP POLICY IF EXISTS perm_super_read ON public.admin_permissions;
CREATE POLICY perm_super_read ON public.admin_permissions
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'
));

DROP POLICY IF EXISTS profiles_admin_read ON public.profiles;
DROP POLICY IF EXISTS profiles_super_all ON public.profiles;
CREATE POLICY profiles_super_all ON public.profiles
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'
));

DROP POLICY IF EXISTS schools_public_read ON public.schools;
DROP POLICY IF EXISTS schools_admin_update ON public.schools;
DROP POLICY IF EXISTS schools_super_all ON public.schools;
CREATE POLICY schools_public_branding_read ON public.schools
FOR SELECT TO anon
USING (true);
CREATE POLICY schools_member_read ON public.schools
FOR SELECT TO authenticated
USING (
  id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
);
CREATE POLICY schools_admin_update ON public.schools
FOR UPDATE TO authenticated
USING (
  id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
)
WITH CHECK (
  id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
);
CREATE POLICY schools_super_all ON public.schools
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'
));

REVOKE ALL ON public.schools FROM anon;
GRANT SELECT (id, name, short_name, slug, logo_url, subtitle, accent_color, created_at) ON public.schools TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;

DROP POLICY IF EXISTS cand_admin ON public.candidates;
DROP POLICY IF EXISTS cand_read ON public.candidates;
CREATE POLICY cand_admin ON public.candidates FOR ALL TO authenticated
USING (
  (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
   AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
)
WITH CHECK (
  (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
   AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
);
CREATE POLICY cand_read ON public.candidates FOR SELECT TO authenticated
USING (
  school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
);

DROP POLICY IF EXISTS judges_admin ON public.judges;
DROP POLICY IF EXISTS judges_read ON public.judges;
CREATE POLICY judges_admin ON public.judges FOR ALL TO authenticated
USING (
  (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
   AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
)
WITH CHECK (
  (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
   AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
);
CREATE POLICY judges_read ON public.judges FOR SELECT TO authenticated
USING (
  school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
  OR profile_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
);

DROP POLICY IF EXISTS rc_admin ON public.review_categories;
DROP POLICY IF EXISTS rc_read ON public.review_categories;
CREATE POLICY rc_admin ON public.review_categories FOR ALL TO authenticated
USING (
  (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
   AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
)
WITH CHECK (
  (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
   AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
);
CREATE POLICY rc_read ON public.review_categories FOR SELECT TO authenticated
USING (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'));

DROP POLICY IF EXISTS sg_admin ON public.subject_groups;
DROP POLICY IF EXISTS sg_read ON public.subject_groups;
CREATE POLICY sg_admin ON public.subject_groups FOR ALL TO authenticated
USING (
  (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
   AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
)
WITH CHECK (
  (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
   AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
);
CREATE POLICY sg_read ON public.subject_groups FOR SELECT TO authenticated
USING (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'));

DROP POLICY IF EXISTS vr_admin ON public.voting_rules;
DROP POLICY IF EXISTS vr_read ON public.voting_rules;
CREATE POLICY vr_admin ON public.voting_rules FOR ALL TO authenticated
USING (
  (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
   AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
)
WITH CHECK (
  (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
   AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
);
CREATE POLICY vr_read ON public.voting_rules FOR SELECT TO authenticated
USING (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin'));

DROP POLICY IF EXISTS vs_admin ON public.vote_sessions;
DROP POLICY IF EXISTS vs_read ON public.vote_sessions;
CREATE POLICY vs_admin ON public.vote_sessions FOR ALL TO authenticated
USING (
  (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
   AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
)
WITH CHECK (
  (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
   AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
);
CREATE POLICY vs_read ON public.vote_sessions FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
  OR (school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid()) AND status IN ('open','closed'))
);

DROP POLICY IF EXISTS ballots_admin_read ON public.ballots;
DROP POLICY IF EXISTS ballots_self_insert ON public.ballots;
DROP POLICY IF EXISTS ballots_self_read ON public.ballots;
CREATE POLICY ballots_admin_read ON public.ballots FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.vote_sessions s
  WHERE s.id = ballots.session_id
    AND (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
      OR (s.school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
          AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
    )
));
CREATE POLICY ballots_self_insert ON public.ballots FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.judges j WHERE j.id = judge_id AND j.profile_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.vote_sessions s WHERE s.id = session_id AND s.status = 'open')
  AND (SELECT j.school_id FROM public.judges j WHERE j.id = judge_id) = (SELECT s.school_id FROM public.vote_sessions s WHERE s.id = session_id)
);
CREATE POLICY ballots_self_read ON public.ballots FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.judges j WHERE j.id = judge_id AND j.profile_id = auth.uid()));

DROP POLICY IF EXISTS bi_admin_read ON public.ballot_items;
DROP POLICY IF EXISTS bi_self_insert ON public.ballot_items;
DROP POLICY IF EXISTS bi_self_read ON public.ballot_items;
CREATE POLICY bi_admin_read ON public.ballot_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ballots b
  JOIN public.vote_sessions s ON s.id = b.session_id
  WHERE b.id = ballot_items.ballot_id
    AND (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'superadmin')
      OR (s.school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
          AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
    )
));
CREATE POLICY bi_self_insert ON public.ballot_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ballots b
    JOIN public.judges j ON j.id = b.judge_id
    JOIN public.vote_sessions s ON s.id = b.session_id
    JOIN public.candidates c ON c.id = ballot_items.candidate_id
    WHERE b.id = ballot_items.ballot_id
      AND j.profile_id = auth.uid()
      AND c.school_id = s.school_id
  )
);
CREATE POLICY bi_self_read ON public.ballot_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ballots b
  JOIN public.judges j ON j.id = b.judge_id
  WHERE b.id = ballot_items.ballot_id AND j.profile_id = auth.uid()
));

DROP POLICY IF EXISTS branding_admin_delete ON storage.objects;
DROP POLICY IF EXISTS branding_admin_insert ON storage.objects;
DROP POLICY IF EXISTS branding_admin_read ON storage.objects;
DROP POLICY IF EXISTS branding_admin_update ON storage.objects;
CREATE POLICY branding_admin_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('superadmin','admin')));
CREATE POLICY branding_admin_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('superadmin','admin')));
CREATE POLICY branding_admin_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('superadmin','admin')));
CREATE POLICY branding_admin_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('superadmin','admin')))
WITH CHECK (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('superadmin','admin')));

ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY INVOKER;
ALTER FUNCTION public.current_school_id() SECURITY INVOKER;
ALTER FUNCTION public.is_superadmin() SECURITY INVOKER;
ALTER FUNCTION public.is_school_admin(uuid) SECURITY INVOKER;
ALTER FUNCTION public.session_school_id(uuid) SECURITY INVOKER;
ALTER FUNCTION public.session_is_open(uuid) SECURITY INVOKER;
ALTER FUNCTION public.is_my_judge(uuid) SECURITY INVOKER;
ALTER FUNCTION public.ballot_is_mine(uuid) SECURITY INVOKER;
ALTER FUNCTION public.ballot_school_id(uuid) SECURITY INVOKER;
ALTER FUNCTION public.judge_school_id(uuid) SECURITY INVOKER;
ALTER FUNCTION public.candidate_school_id(uuid) SECURITY INVOKER;
ALTER FUNCTION public.enforce_same_school() SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_school_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_school_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.session_school_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.session_is_open(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_my_judge(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ballot_is_mine(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ballot_school_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.judge_school_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.candidate_school_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_same_school() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_school_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.session_school_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.session_is_open(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_my_judge(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ballot_is_mine(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ballot_school_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.judge_school_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.candidate_school_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_same_school() TO service_role;