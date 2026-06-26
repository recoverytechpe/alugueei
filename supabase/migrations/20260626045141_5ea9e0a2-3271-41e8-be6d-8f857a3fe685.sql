
-- Moderation alerts
CREATE TABLE IF NOT EXISTS public.moderation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  reason text NOT NULL,
  excerpt text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.moderation_alerts TO authenticated;
GRANT ALL ON public.moderation_alerts TO service_role;

ALTER TABLE public.moderation_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage moderation alerts"
  ON public.moderation_alerts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER moderation_alerts_updated_at
  BEFORE UPDATE ON public.moderation_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to detect contact attempts in chat messages
CREATE OR REPLACE FUNCTION public.detect_contact_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  body_lower text := lower(coalesce(NEW.body,''));
  digit_count int;
  reasons text[] := ARRAY[]::text[];
BEGIN
  digit_count := length(regexp_replace(NEW.body, '\D', '', 'g'));
  IF digit_count >= 8 THEN
    reasons := array_append(reasons, 'possível telefone');
  END IF;
  IF NEW.body ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' THEN
    reasons := array_append(reasons, 'possível email');
  END IF;
  IF body_lower ~ '(whats\s*app|whatsapp|telegram|instagram|insta\b|fora da plataforma|por fora|combinar fora|pix|transfer[êe]ncia)' THEN
    reasons := array_append(reasons, 'menção a canal/pagamento externo');
  END IF;
  IF array_length(reasons,1) > 0 THEN
    INSERT INTO public.moderation_alerts (conversation_id, message_id, sender_id, reason, excerpt, severity)
    VALUES (
      NEW.conversation_id, NEW.id, NEW.sender_id,
      array_to_string(reasons, ', '),
      left(NEW.body, 240),
      CASE WHEN array_length(reasons,1) >= 2 THEN 'high' ELSE 'medium' END
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.detect_contact_attempt() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS messages_detect_contact_attempt ON public.messages;
CREATE TRIGGER messages_detect_contact_attempt
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.detect_contact_attempt();

-- Agent visibility score
CREATE OR REPLACE FUNCTION public.get_agent_visibility(_agent_id uuid)
RETURNS TABLE(closed_deals bigint, avg_stars numeric, total_ratings bigint, visibility_score numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH deals AS (
    SELECT count(*)::bigint AS c
    FROM public.rental_contracts
    WHERE agent_id = _agent_id AND status = 'closed'
  ),
  r AS (
    SELECT COALESCE(AVG(stars)::numeric(3,2),0) AS avg_stars, count(*)::bigint AS total
    FROM public.agent_ratings WHERE agent_id = _agent_id
  )
  SELECT deals.c, r.avg_stars, r.total,
    (deals.c * 2 + r.avg_stars * sqrt(GREATEST(r.total,0)))::numeric(8,2)
  FROM deals, r;
$$;

GRANT EXECUTE ON FUNCTION public.get_agent_visibility(uuid) TO authenticated, anon;

-- Admin SELECT policies on negotiation/chat tables
CREATE POLICY "Admins read all proposals" ON public.proposals
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all visits" ON public.visits
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all contracts" ON public.rental_contracts
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all conversations" ON public.conversations
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all messages" ON public.messages
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
