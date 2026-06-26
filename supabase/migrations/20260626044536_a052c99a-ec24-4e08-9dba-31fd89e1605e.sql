-- VISITS
CREATE TABLE public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  agent_id uuid,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','done','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visits TO authenticated;
GRANT ALL ON public.visits TO service_role;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visit parties view" ON public.visits FOR SELECT TO authenticated
  USING (auth.uid() IN (owner_id, tenant_id, agent_id));
CREATE POLICY "Tenant or agent create visit" ON public.visits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (tenant_id, agent_id));
CREATE POLICY "Visit parties update" ON public.visits FOR UPDATE TO authenticated
  USING (auth.uid() IN (owner_id, tenant_id, agent_id))
  WITH CHECK (auth.uid() IN (owner_id, tenant_id, agent_id));
CREATE TRIGGER update_visits_updated_at BEFORE UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PROPOSALS
CREATE TABLE public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  agent_id uuid,
  rent_offer numeric NOT NULL,
  term_months integer NOT NULL DEFAULT 12,
  start_date date NOT NULL,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO authenticated;
GRANT ALL ON public.proposals TO service_role;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Proposal parties view" ON public.proposals FOR SELECT TO authenticated
  USING (auth.uid() IN (owner_id, tenant_id, agent_id));
CREATE POLICY "Tenant creates proposal" ON public.proposals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY "Owner or tenant update proposal" ON public.proposals FOR UPDATE TO authenticated
  USING (auth.uid() IN (owner_id, tenant_id))
  WITH CHECK (auth.uid() IN (owner_id, tenant_id));
CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CONTRACT TEXT + SIGNATURES
ALTER TABLE public.rental_contracts
  ADD COLUMN IF NOT EXISTS contract_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rent_value numeric,
  ADD COLUMN IF NOT EXISTS term_months integer,
  ADD COLUMN IF NOT EXISTS start_date date;

CREATE TABLE public.contract_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  signer_id uuid NOT NULL,
  signer_role text NOT NULL CHECK (signer_role IN ('owner','tenant','agent')),
  signature_text text NOT NULL CHECK (char_length(signature_text) BETWEEN 2 AND 200),
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, signer_id)
);
GRANT SELECT, INSERT, DELETE ON public.contract_signatures TO authenticated;
GRANT ALL ON public.contract_signatures TO service_role;
ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contract parties view signatures" ON public.contract_signatures FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id
      AND auth.uid() IN (c.owner_id, c.tenant_id, c.agent_id)
  ));
CREATE POLICY "Signer signs as themselves" ON public.contract_signatures FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = signer_id
    AND EXISTS (
      SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id
        AND (
          (signer_role = 'owner'  AND c.owner_id  = auth.uid()) OR
          (signer_role = 'tenant' AND c.tenant_id = auth.uid()) OR
          (signer_role = 'agent'  AND c.agent_id  = auth.uid())
        )
    )
  );

-- Generate contract automatically when a proposal is accepted
CREATE OR REPLACE FUNCTION public.generate_contract_on_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.properties%ROWTYPE;
  owner_name text;
  tenant_name text;
  agent_name text;
  body text;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    SELECT * INTO p FROM public.properties WHERE id = NEW.property_id;
    SELECT full_name INTO owner_name FROM public.profiles WHERE id = NEW.owner_id;
    SELECT full_name INTO tenant_name FROM public.profiles WHERE id = NEW.tenant_id;
    IF NEW.agent_id IS NOT NULL THEN
      SELECT full_name INTO agent_name FROM public.profiles WHERE id = NEW.agent_id;
    END IF;

    body :=
      'CONTRATO DE LOCAÇÃO RESIDENCIAL' || E'\n\n' ||
      'LOCADOR: ' || COALESCE(owner_name,'') || E'\n' ||
      'LOCATÁRIO: ' || COALESCE(tenant_name,'') || E'\n' ||
      CASE WHEN agent_name IS NOT NULL THEN 'AGENTE: ' || agent_name || E'\n' ELSE '' END ||
      E'\nIMÓVEL: ' || p.title || E'\n' ||
      'Endereço: ' || p.street || ', ' || p.number ||
      COALESCE(' - ' || p.complement, '') ||
      ' - ' || COALESCE(p.neighborhood,'') || ' - ' || p.city || '/' || p.state ||
      ' - CEP ' || p.cep || E'\n\n' ||
      'CONDIÇÕES:' || E'\n' ||
      '• Valor mensal do aluguel: R$ ' || to_char(NEW.rent_offer, 'FM999G999G990D00') || E'\n' ||
      '• Condomínio: R$ ' || to_char(p.condo_value, 'FM999G999G990D00') || E'\n' ||
      '• IPTU: R$ ' || to_char(p.iptu_value, 'FM999G999G990D00') || E'\n' ||
      '• Prazo: ' || NEW.term_months || ' meses, a partir de ' || to_char(NEW.start_date,'DD/MM/YYYY') || E'\n\n' ||
      'As partes declaram aceitar integralmente as condições acima e firmam o presente contrato por meio de assinatura eletrônica.';

    INSERT INTO public.rental_contracts
      (property_id, owner_id, tenant_id, agent_id, status, proposal_id, contract_text, rent_value, term_months, start_date)
    VALUES
      (NEW.property_id, NEW.owner_id, NEW.tenant_id, NEW.agent_id, 'active', NEW.id, body, NEW.rent_offer, NEW.term_months, NEW.start_date);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proposals_generate_contract
  AFTER UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.generate_contract_on_accept();

-- When all required parties have signed, close the contract (unlocks ratings)
CREATE OR REPLACE FUNCTION public.maybe_close_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.rental_contracts%ROWTYPE;
  required int;
  signed int;
BEGIN
  SELECT * INTO c FROM public.rental_contracts WHERE id = NEW.contract_id;
  required := 2 + CASE WHEN c.agent_id IS NOT NULL THEN 1 ELSE 0 END;
  SELECT count(*) INTO signed FROM public.contract_signatures WHERE contract_id = NEW.contract_id;
  IF signed >= required AND c.status <> 'closed' THEN
    UPDATE public.rental_contracts SET status = 'closed', updated_at = now() WHERE id = NEW.contract_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER signatures_maybe_close
  AFTER INSERT ON public.contract_signatures
  FOR EACH ROW EXECUTE FUNCTION public.maybe_close_contract();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.visits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.proposals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rental_contracts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contract_signatures;
