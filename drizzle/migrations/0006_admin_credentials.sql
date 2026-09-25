CREATE TABLE public.admin_credentials (user_id uuid PRIMARY KEY, current_password text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.admin_credentials TO service_role;
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;