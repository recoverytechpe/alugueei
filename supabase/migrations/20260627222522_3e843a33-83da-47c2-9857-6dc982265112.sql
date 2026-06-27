-- Revoke direct browser read access to sensitive profile fields. The app should
-- update these fields as the owner, but not expose them through broad profile
-- directory reads.

REVOKE SELECT (phone, cpf_cnpj) ON public.profiles FROM authenticated;
