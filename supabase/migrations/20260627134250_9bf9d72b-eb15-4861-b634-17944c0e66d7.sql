
-- Status enum
CREATE TYPE public.affiliation_status AS ENUM ('pending','approved','rejected','revoked','expired','completed');

-- Table
CREATE TABLE public.property_affiliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.affiliation_status NOT NULL DEFAULT 'pending',
  owner_commission_pct numeric(5,2) NOT NULL DEFAULT 30.00 CHECK (owner_commission_pct >= 0 AND owner_commission_pct <= 100),
  tenant_commission_pct numeric(5,2) NOT NULL DEFAULT 20.00 CHECK (tenant_commission_pct >= 0 AND tenant_commission_pct <= 100),
  can_edit_listing boolean NOT NULL DEFAULT false,
  message text,
  rejected_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_affiliations_property ON public.property_affiliations(property_id);
CREATE INDEX idx_affiliations_agent ON public.property_affiliations(agent_id);
CREATE INDEX idx_affiliations_status ON public.property_affiliations(status);

-- Apenas uma afiliação ativa por par agente+imóvel
CREATE UNIQUE INDEX uniq_affiliation_active
  ON public.property_affiliations(property_id, agent_id)
  WHERE status IN ('pending','approved');

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_affiliations TO authenticated;
GRANT ALL ON public.property_affiliations TO service_role;

-- RLS
ALTER TABLE public.property_affiliations ENABLE ROW LEVEL SECURITY;

-- Helper: é o dono do imóvel?
CREATE OR REPLACE FUNCTION public.is_property_owner(_user_id uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.properties WHERE id = _property_id AND owner_id = _user_id);
$$;

-- SELECT: agente vê as próprias; dono vê do seu imóvel
CREATE POLICY "View own or owned affiliations"
ON public.property_affiliations FOR SELECT
TO authenticated
USING (
  agent_id = auth.uid()
  OR public.is_property_owner(auth.uid(), property_id)
);

-- INSERT: somente agentes podem solicitar, em nome próprio, status pending,
-- e o imóvel precisa estar disponível
CREATE POLICY "Agents request affiliation"
ON public.property_affiliations FOR INSERT
TO authenticated
WITH CHECK (
  agent_id = auth.uid()
  AND status = 'pending'
  AND public.has_role(auth.uid(), 'agente'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_id AND p.status = 'available' AND p.owner_id <> auth.uid()
  )
);

-- UPDATE: dono pode alterar (aprovar, rejeitar, revogar, permissões, comissão)
CREATE POLICY "Owner manages affiliation"
ON public.property_affiliations FOR UPDATE
TO authenticated
USING (public.is_property_owner(auth.uid(), property_id))
WITH CHECK (public.is_property_owner(auth.uid(), property_id));

-- UPDATE: agente pode cancelar a própria solicitação (revoked) se ainda pendente
CREATE POLICY "Agent cancels own pending"
ON public.property_affiliations FOR UPDATE
TO authenticated
USING (agent_id = auth.uid() AND status = 'pending')
WITH CHECK (agent_id = auth.uid() AND status IN ('pending','revoked'));

-- Trigger: ao mudar para 'approved', setar approved_at e expires_at (90 dias)
CREATE OR REPLACE FUNCTION public.tg_affiliation_approve()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    NEW.approved_at := now();
    NEW.expires_at := now() + interval '90 days';
    PERFORM public.notify_user(
      NEW.agent_id, 'affiliation',
      'Afiliação aprovada',
      'Você foi aprovado para divulgar um imóvel.',
      '/properties/' || NEW.property_id
    );
  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    PERFORM public.notify_user(
      NEW.agent_id, 'affiliation',
      'Afiliação recusada',
      COALESCE(NEW.rejected_reason, 'Sua solicitação foi recusada.'),
      '/properties/' || NEW.property_id
    );
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_affiliation_approve
BEFORE UPDATE ON public.property_affiliations
FOR EACH ROW EXECUTE FUNCTION public.tg_affiliation_approve();

-- Trigger: notificar dono ao receber novo pedido
CREATE OR REPLACE FUNCTION public.tg_affiliation_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner uuid;
  ptitle text;
BEGIN
  SELECT owner_id, title INTO owner, ptitle FROM public.properties WHERE id = NEW.property_id;
  IF owner IS NOT NULL THEN
    PERFORM public.notify_user(
      owner, 'affiliation',
      'Novo pedido de afiliação',
      'Um agente solicitou afiliação ao imóvel "' || COALESCE(ptitle,'') || '".',
      '/properties/' || NEW.property_id
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tg_affiliation_request() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tg_affiliation_request
AFTER INSERT ON public.property_affiliations
FOR EACH ROW EXECUTE FUNCTION public.tg_affiliation_request();

-- Trigger: quando imóvel vira 'rented', completar afiliações aprovadas
CREATE OR REPLACE FUNCTION public.tg_property_rented_complete_affiliations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'rented' AND OLD.status IS DISTINCT FROM 'rented' THEN
    UPDATE public.property_affiliations
    SET status = 'completed', updated_at = now()
    WHERE property_id = NEW.id AND status IN ('pending','approved');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tg_property_rented_complete_affiliations() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tg_property_rented_complete_affiliations
AFTER UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.tg_property_rented_complete_affiliations();
