
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own push subs"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_push_subs_updated
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Settings to be used by trigger function
-- These are read at trigger time via current_setting()
CREATE OR REPLACE FUNCTION public.dispatch_push(_user_id uuid, _title text, _body text, _url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  fn_url text := 'https://vvsoctvmctomovcebvli.supabase.co/functions/v1/push-dispatch';
  shared text := 'push-dispatch-shared-secret-2026';
BEGIN
  PERFORM extensions.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', shared),
    body := jsonb_build_object('user_id', _user_id, 'title', _title, 'body', _body, 'url', _url)
  );
EXCEPTION WHEN OTHERS THEN
  -- never fail the original mutation due to push errors
  RAISE NOTICE 'dispatch_push failed: %', SQLERRM;
END;
$$;

-- pg_net uses net.http_post; create wrapper to match
CREATE OR REPLACE FUNCTION extensions.http_post(url text, headers jsonb, body jsonb)
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT net.http_post(url := url, headers := headers, body := body);
$$;

-- Proposal notifications: notify owner on new proposal, tenant on status change
CREATE OR REPLACE FUNCTION public.tg_notify_proposal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.dispatch_push(NEW.owner_id, 'Nova proposta recebida', 'Você recebeu uma proposta de aluguel.', '/dashboard');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.dispatch_push(NEW.tenant_id, 'Proposta atualizada', 'Status: ' || NEW.status, '/dashboard');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_proposal
  AFTER INSERT OR UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_proposal();

-- Visit notifications
CREATE OR REPLACE FUNCTION public.tg_notify_visit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.dispatch_push(NEW.owner_id, 'Nova visita agendada', to_char(NEW.scheduled_at, 'DD/MM HH24:MI'), '/dashboard');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public.dispatch_push(NEW.tenant_id, 'Visita confirmada', to_char(NEW.scheduled_at, 'DD/MM HH24:MI'), '/dashboard');
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_visit
  AFTER INSERT OR UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_visit();

-- Contract notifications
CREATE OR REPLACE FUNCTION public.tg_notify_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.dispatch_push(NEW.owner_id, 'Novo contrato gerado', 'Acesse para assinar.', '/contracts');
    PERFORM public.dispatch_push(NEW.tenant_id, 'Novo contrato gerado', 'Acesse para assinar.', '/contracts');
    IF NEW.agent_id IS NOT NULL THEN
      PERFORM public.dispatch_push(NEW.agent_id, 'Novo contrato gerado', 'Acesse para assinar.', '/contracts');
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.dispatch_push(NEW.owner_id, 'Contrato: ' || NEW.status, 'Atualização do contrato.', '/contracts');
    PERFORM public.dispatch_push(NEW.tenant_id, 'Contrato: ' || NEW.status, 'Atualização do contrato.', '/contracts');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_contract
  AFTER INSERT OR UPDATE ON public.rental_contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_contract();
