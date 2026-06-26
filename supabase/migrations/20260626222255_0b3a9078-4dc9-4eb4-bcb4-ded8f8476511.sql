
-- Sprint 1: Paywall foundation — property_unlocks table + has_unlock helper

CREATE TABLE public.property_unlocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','refunded')),
  amount_cents INTEGER NOT NULL DEFAULT 2990,
  terms_accepted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, property_id)
);

CREATE INDEX idx_property_unlocks_user ON public.property_unlocks(user_id);
CREATE INDEX idx_property_unlocks_property ON public.property_unlocks(property_id);
CREATE INDEX idx_property_unlocks_status ON public.property_unlocks(status);

GRANT SELECT, INSERT, UPDATE ON public.property_unlocks TO authenticated;
GRANT ALL ON public.property_unlocks TO service_role;

ALTER TABLE public.property_unlocks ENABLE ROW LEVEL SECURITY;

-- O lead vê seus próprios unlocks; o proprietário vê os unlocks do seu imóvel
CREATE POLICY "users see own unlocks"
  ON public.property_unlocks FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.owner_id = auth.uid())
  );

-- Lead cria seu próprio registro (status inicial 'pending'); o webhook (service_role) muda para 'paid'
CREATE POLICY "users insert own unlocks"
  ON public.property_unlocks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Lead pode atualizar terms_accepted_at no próprio registro pendente
CREATE POLICY "users accept own terms"
  ON public.property_unlocks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_property_unlocks_updated_at
  BEFORE UPDATE ON public.property_unlocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: imóvel desbloqueado para um user?
-- Proprietário e agente do contrato sempre veem; lead só com status='paid' e não-expirado.
CREATE OR REPLACE FUNCTION public.has_unlock(_user_id UUID, _property_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = _property_id AND p.owner_id = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.property_unlocks u
      WHERE u.user_id = _user_id
        AND u.property_id = _property_id
        AND u.status = 'paid'
        AND (u.expires_at IS NULL OR u.expires_at > now())
    );
$$;
