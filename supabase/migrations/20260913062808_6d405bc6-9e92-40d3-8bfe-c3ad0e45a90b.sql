-- enums
CREATE TYPE public.app_role AS ENUM ('superadmin','admin','judge');
CREATE TYPE public.admin_permission AS ENUM ('branding','judges','candidates','groups_rules','results');
CREATE TYPE public.committee_role AS ENUM ('chair','vice_chair','member');

-- schools
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  slug text NOT NULL UNIQUE,
  logo_url text,
  subtitle text,
  accent_color text NOT NULL DEFAULT '#6B6B66',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.schools TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  username text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission public.admin_permission NOT NULL,
  UNIQUE (user_id, permission)
);
GRANT SELECT ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'superadmin');
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin') AND public.current_school_id() = _school_id;
$$;

-- schools policies
CREATE POLICY "schools_public_read" ON public.schools FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "schools_super_all" ON public.schools FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "schools_admin_update" ON public.schools FOR UPDATE TO authenticated USING (public.is_school_admin(id)) WITH CHECK (public.is_school_admin(id));

-- profiles policies
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_super_all" ON public.profiles FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "profiles_admin_read" ON public.profiles FOR SELECT TO authenticated USING (public.is_school_admin(school_id));

-- roles policies
CREATE POLICY "roles_self_read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "roles_super_read" ON public.user_roles FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY "perm_self_read" ON public.admin_permissions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "perm_super_read" ON public.admin_permissions FOR SELECT TO authenticated USING (public.is_superadmin());

-- review categories
CREATE TABLE public.review_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_categories TO authenticated;
GRANT ALL ON public.review_categories TO service_role;
ALTER TABLE public.review_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.subject_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  leader_mode text NOT NULL DEFAULT 'appointed',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_groups TO authenticated;
GRANT ALL ON public.subject_groups TO service_role;
ALTER TABLE public.subject_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.judges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id uuid,
  full_name text NOT NULL,
  staff_no text,
  unit text,
  title text,
  phone text,
  username text,
  committee_role public.committee_role NOT NULL DEFAULT 'member',
  group_id uuid REFERENCES public.subject_groups(id) ON DELETE SET NULL,
  is_group_leader boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.judges TO authenticated;
GRANT ALL ON public.judges TO service_role;
ALTER TABLE public.judges ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  unit text,
  current_title text,
  category_id uuid REFERENCES public.review_categories(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.subject_groups(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.voting_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.review_categories(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.subject_groups(id) ON DELETE CASCADE,
  total_count int NOT NULL DEFAULT 0,
  max_recommend int NOT NULL DEFAULT 0,
  allow_abstain boolean NOT NULL DEFAULT true,
  require_all boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voting_rules TO authenticated;
GRANT ALL ON public.voting_rules TO service_role;
ALTER TABLE public.voting_rules ENABLE ROW LEVEL SECURITY;

-- shared school-scoped policies
CREATE POLICY "rc_read" ON public.review_categories FOR SELECT TO authenticated USING (school_id = public.current_school_id() OR public.is_superadmin());
CREATE POLICY "rc_admin" ON public.review_categories FOR ALL TO authenticated USING (public.is_school_admin(school_id) OR public.is_superadmin()) WITH CHECK (public.is_school_admin(school_id) OR public.is_superadmin());

CREATE POLICY "sg_read" ON public.subject_groups FOR SELECT TO authenticated USING (school_id = public.current_school_id() OR public.is_superadmin());
CREATE POLICY "sg_admin" ON public.subject_groups FOR ALL TO authenticated USING (public.is_school_admin(school_id) OR public.is_superadmin()) WITH CHECK (public.is_school_admin(school_id) OR public.is_superadmin());

CREATE POLICY "judges_read" ON public.judges FOR SELECT TO authenticated USING (school_id = public.current_school_id() OR public.is_superadmin());
CREATE POLICY "judges_admin" ON public.judges FOR ALL TO authenticated USING (public.is_school_admin(school_id) OR public.is_superadmin()) WITH CHECK (public.is_school_admin(school_id) OR public.is_superadmin());

CREATE POLICY "cand_read" ON public.candidates FOR SELECT TO authenticated USING (school_id = public.current_school_id() OR public.is_superadmin());
CREATE POLICY "cand_admin" ON public.candidates FOR ALL TO authenticated USING (public.is_school_admin(school_id) OR public.is_superadmin()) WITH CHECK (public.is_school_admin(school_id) OR public.is_superadmin());

CREATE POLICY "vr_read" ON public.voting_rules FOR SELECT TO authenticated USING (school_id = public.current_school_id() OR public.is_superadmin());
CREATE POLICY "vr_admin" ON public.voting_rules FOR ALL TO authenticated USING (public.is_school_admin(school_id) OR public.is_superadmin()) WITH CHECK (public.is_school_admin(school_id) OR public.is_superadmin());

CREATE INDEX idx_judges_school ON public.judges(school_id);
CREATE INDEX idx_candidates_school ON public.candidates(school_id);