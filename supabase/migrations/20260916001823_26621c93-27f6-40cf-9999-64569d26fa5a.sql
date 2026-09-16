CREATE POLICY judge_credentials_no_direct_access
ON public.judge_credentials
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);