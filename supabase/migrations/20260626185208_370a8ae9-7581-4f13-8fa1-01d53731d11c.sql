
CREATE TABLE public.favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, property_id)
);
CREATE INDEX favorites_user_idx ON public.favorites(user_id);
CREATE INDEX favorites_property_idx ON public.favorites(property_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own favorites" ON public.favorites FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TYPE public.guarantee_type AS ENUM ('fiador','seguro_fianca','caucao','titulo_capitalizacao');
CREATE TYPE public.preapproval_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.tenant_preapprovals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  monthly_income NUMERIC(12,2) NOT NULL CHECK (monthly_income >= 0),
  guarantee_type public.guarantee_type NOT NULL,
  max_rent NUMERIC(12,2) NOT NULL,
  status public.preapproval_status NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_preapprovals TO authenticated;
GRANT ALL ON public.tenant_preapprovals TO service_role;
ALTER TABLE public.tenant_preapprovals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own preapproval" ON public.tenant_preapprovals FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can view preapproval of tenants who proposed" ON public.tenant_preapprovals FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.tenant_id = tenant_preapprovals.user_id AND p.owner_id = auth.uid()));
CREATE TRIGGER trg_tenant_preapprovals_updated BEFORE UPDATE ON public.tenant_preapprovals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
