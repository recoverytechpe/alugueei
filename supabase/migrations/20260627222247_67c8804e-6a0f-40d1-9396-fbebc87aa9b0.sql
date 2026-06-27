-- Restore the minimum Data API privileges needed by authenticated users
-- after profile hardening, without granting public cross-user access to
-- sensitive profile fields.

GRANT SELECT (
  id,
  full_name,
  avatar_url,
  bio,
  user_type,
  preferred_city,
  onboarded_at,
  terms_accepted_at,
  terms_version,
  privacy_accepted_at,
  privacy_version,
  created_at,
  updated_at
) ON public.profiles TO authenticated;

GRANT INSERT (
  id,
  full_name,
  phone,
  cpf_cnpj,
  avatar_url,
  bio,
  preferred_city,
  user_type,
  onboarded_at,
  terms_accepted_at,
  terms_version,
  privacy_accepted_at,
  privacy_version
) ON public.profiles TO authenticated;

GRANT UPDATE (
  full_name,
  phone,
  cpf_cnpj,
  avatar_url,
  bio,
  preferred_city,
  user_type,
  onboarded_at,
  terms_accepted_at,
  terms_version,
  privacy_accepted_at,
  privacy_version,
  updated_at
) ON public.profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;

-- Keep cross-user access row-scoped to safe/profile-list reads only.
-- Full sensitive reads still require the existing owner-only policy.
DROP POLICY IF EXISTS "Authenticated read safe profile columns" ON public.profiles;

CREATE POLICY "Authenticated users can read profile directory rows"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);
