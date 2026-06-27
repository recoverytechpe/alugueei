-- Allow authenticated users to read their own sensitive profile fields for
-- self-service onboarding/profile editing. Cross-user reads remain restricted
-- because the safe directory grant intentionally excludes these columns and
-- the owner-only RLS policy is still scoped to auth.uid() = id.

GRANT SELECT (phone, cpf_cnpj) ON public.profiles TO authenticated;
