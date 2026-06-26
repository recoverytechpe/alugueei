
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('proposal','contract','visit','payment','message','system')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  url text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own notifications select" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own notifications update" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own notifications delete" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper
CREATE OR REPLACE FUNCTION public.notify_user(_user_id uuid, _kind text, _title text, _body text, _url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, kind, title, body, url)
  VALUES (_user_id, _kind, _title, COALESCE(_body,''), _url);
END;
$$;

-- Proposals
CREATE OR REPLACE FUNCTION public.tg_notify_proposal_inapp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(NEW.owner_id, 'proposal', 'Nova proposta recebida', 'Você recebeu uma proposta de aluguel.', '/dashboard');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify_user(NEW.tenant_id, 'proposal', 'Proposta ' || NEW.status, 'Sua proposta foi atualizada.', '/dashboard');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_proposal_inapp ON public.proposals;
CREATE TRIGGER trg_notify_proposal_inapp
  AFTER INSERT OR UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_proposal_inapp();

-- Contracts
CREATE OR REPLACE FUNCTION public.tg_notify_contract_inapp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(NEW.owner_id, 'contract', 'Novo contrato gerado', 'Acesse para assinar.', '/contracts/' || NEW.id);
    PERFORM public.notify_user(NEW.tenant_id, 'contract', 'Novo contrato gerado', 'Acesse para assinar.', '/contracts/' || NEW.id);
    IF NEW.agent_id IS NOT NULL THEN
      PERFORM public.notify_user(NEW.agent_id, 'contract', 'Novo contrato gerado', 'Acesse para assinar.', '/contracts/' || NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.notify_user(NEW.owner_id, 'contract', 'Contrato: ' || NEW.status, 'Status atualizado.', '/contracts/' || NEW.id);
      PERFORM public.notify_user(NEW.tenant_id, 'contract', 'Contrato: ' || NEW.status, 'Status atualizado.', '/contracts/' || NEW.id);
    END IF;
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      PERFORM public.notify_user(NEW.owner_id, 'payment', 'Pagamento: ' || NEW.payment_status, 'Status do pagamento atualizado.', '/contracts/' || NEW.id);
      PERFORM public.notify_user(NEW.tenant_id, 'payment', 'Pagamento: ' || NEW.payment_status, 'Status do pagamento atualizado.', '/contracts/' || NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_contract_inapp ON public.rental_contracts;
CREATE TRIGGER trg_notify_contract_inapp
  AFTER INSERT OR UPDATE ON public.rental_contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_contract_inapp();

-- Visits
CREATE OR REPLACE FUNCTION public.tg_notify_visit_inapp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(NEW.owner_id, 'visit', 'Nova visita agendada', to_char(NEW.scheduled_at, 'DD/MM HH24:MI'), '/dashboard');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify_user(NEW.tenant_id, 'visit', 'Visita ' || NEW.status, to_char(NEW.scheduled_at, 'DD/MM HH24:MI'), '/dashboard');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_visit_inapp ON public.visits;
CREATE TRIGGER trg_notify_visit_inapp
  AFTER INSERT OR UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_visit_inapp();

-- Payments
CREATE OR REPLACE FUNCTION public.tg_notify_payment_inapp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.rental_contracts%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT * INTO c FROM public.rental_contracts WHERE id = NEW.contract_id;
    PERFORM public.notify_user(c.tenant_id, 'payment', 'Pagamento: ' || NEW.status, 'R$ ' || to_char(NEW.amount, 'FM999G999G990D00'), '/contracts/' || NEW.contract_id);
    PERFORM public.notify_user(c.owner_id, 'payment', 'Pagamento: ' || NEW.status, 'R$ ' || to_char(NEW.amount, 'FM999G999G990D00'), '/contracts/' || NEW.contract_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_payment_inapp ON public.payments;
CREATE TRIGGER trg_notify_payment_inapp
  AFTER UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_payment_inapp();
