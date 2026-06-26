ALTER TABLE public.rental_contracts
  ADD COLUMN IF NOT EXISTS deposit_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','processing','paid','failed','refunded')),
  ADD COLUMN IF NOT EXISTS payment_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'mercadopago',
  provider_payment_id text,
  preference_id text,
  kind text NOT NULL CHECK (kind IN ('deposit_plus_first_rent','rent','deposit','other')),
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','authorized','in_process','rejected','refunded','cancelled')),
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties view contract payments" ON public.payments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rental_contracts c
    WHERE c.id = contract_id
      AND auth.uid() IN (c.owner_id, c.tenant_id, c.agent_id)
  ));

CREATE POLICY "Payer creates payment" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = payer_id);

CREATE INDEX IF NOT EXISTS idx_payments_contract ON public.payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_id ON public.payments(provider_payment_id);

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();