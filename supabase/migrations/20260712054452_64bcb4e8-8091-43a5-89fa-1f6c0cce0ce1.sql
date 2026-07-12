
DROP POLICY IF EXISTS "Authenticated can view ratings" ON public.agent_ratings;

CREATE POLICY "Contract parties and admins can view ratings"
ON public.agent_ratings
FOR SELECT
TO authenticated
USING (
  auth.uid() = rater_id
  OR auth.uid() = agent_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.rental_contracts c
    WHERE c.id = agent_ratings.contract_id
      AND (auth.uid() = c.owner_id OR auth.uid() = c.tenant_id OR auth.uid() = c.agent_id)
  )
);

-- Explicit deny-all restrictive policy on _app_secrets so any accidental
-- future permissive policy cannot expose rows via the Data API.
REVOKE ALL ON public._app_secrets FROM anon, authenticated;

DROP POLICY IF EXISTS "Deny all client access" ON public._app_secrets;
CREATE POLICY "Deny all client access"
ON public._app_secrets
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
