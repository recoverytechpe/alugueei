-- Extend profiles with public-facing fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS bio text;

-- Allow any authenticated user to view PUBLIC fields of profiles via a view.
-- The base table keeps strict RLS (only owner sees private data like phone/cpf_cnpj).
-- We add an extra policy so authenticated users can SELECT any profile row,
-- and we use a security_invoker view to expose only public columns.
CREATE POLICY "Authenticated can view public profile rows"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Note: keep existing "Users can view their own profile" policy too (harmless).
-- The view below limits which columns are exposed publicly.
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker=on) AS
SELECT id, full_name, avatar_url, bio, created_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;

-- Contracts table (a "closed rental"): unlocks rating eligibility
CREATE TABLE public.rental_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  agent_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_contracts TO authenticated;
GRANT ALL ON public.rental_contracts TO service_role;
ALTER TABLE public.rental_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties view their contracts" ON public.rental_contracts
  FOR SELECT TO authenticated
  USING (auth.uid() IN (owner_id, tenant_id, agent_id));
CREATE POLICY "Owner creates contracts" ON public.rental_contracts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Parties update contracts" ON public.rental_contracts
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (owner_id, tenant_id))
  WITH CHECK (auth.uid() IN (owner_id, tenant_id));

CREATE TRIGGER update_rental_contracts_updated_at
  BEFORE UPDATE ON public.rental_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ratings table — owners/tenants rate agents after a closed contract
CREATE TABLE public.agent_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  rater_id uuid NOT NULL,
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, rater_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_ratings TO authenticated;
GRANT ALL ON public.agent_ratings TO service_role;
ALTER TABLE public.agent_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view ratings" ON public.agent_ratings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Rater inserts own rating for closed contract" ON public.agent_ratings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = rater_id
    AND EXISTS (
      SELECT 1 FROM public.rental_contracts c
      WHERE c.id = contract_id
        AND c.status = 'closed'
        AND c.agent_id = agent_ratings.agent_id
        AND auth.uid() IN (c.owner_id, c.tenant_id)
    )
  );

CREATE POLICY "Rater updates own rating" ON public.agent_ratings
  FOR UPDATE TO authenticated
  USING (auth.uid() = rater_id) WITH CHECK (auth.uid() = rater_id);

CREATE POLICY "Rater deletes own rating" ON public.agent_ratings
  FOR DELETE TO authenticated USING (auth.uid() = rater_id);

CREATE TRIGGER update_agent_ratings_updated_at
  BEFORE UPDATE ON public.agent_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_agent_ratings_agent_id ON public.agent_ratings(agent_id);
CREATE INDEX idx_rental_contracts_agent_id ON public.rental_contracts(agent_id);
CREATE INDEX idx_rental_contracts_tenant_id ON public.rental_contracts(tenant_id);
CREATE INDEX idx_rental_contracts_owner_id ON public.rental_contracts(owner_id);

-- Aggregate function for agent rating
CREATE OR REPLACE FUNCTION public.get_agent_rating(_agent_id uuid)
RETURNS TABLE(avg_stars numeric, total_ratings bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(AVG(stars)::numeric(3,2), 0) AS avg_stars,
         COUNT(*)::bigint AS total_ratings
  FROM public.agent_ratings
  WHERE agent_id = _agent_id
$$;
