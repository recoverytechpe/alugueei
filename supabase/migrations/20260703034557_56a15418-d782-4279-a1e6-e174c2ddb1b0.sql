
-- 1) Restrict anonymous SELECT on public.properties to safe (non-address) columns only.
--    Anon users must not see street/number/complement/cep or owner_id.
REVOKE SELECT ON public.properties FROM anon;
GRANT SELECT (
  id, slug, title, description, property_type, status,
  neighborhood, city, state,
  bedrooms, bathrooms, parking_spots, area_m2,
  rent_value, condo_value, iptu_value,
  created_at, updated_at
) ON public.properties TO anon;

-- 2) Allow admins to read all tenant_ratings for moderation.
DROP POLICY IF EXISTS "admin reads all tenant ratings" ON public.tenant_ratings;
CREATE POLICY "admin reads all tenant ratings"
  ON public.tenant_ratings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
