ALTER TABLE public.rental_contracts
  ADD COLUMN IF NOT EXISTS agent_commission_pct numeric(5,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS agent_commission_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS agent_commission_marked_by uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.mark_agent_commission_paid(_contract_id uuid)
RETURNS public.rental_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rental_contracts%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.rental_contracts WHERE id = _contract_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'contract not found'; END IF;
  IF r.owner_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF r.agent_id IS NULL THEN RAISE EXCEPTION 'no agent'; END IF;

  UPDATE public.rental_contracts
    SET agent_commission_paid_at = COALESCE(agent_commission_paid_at, now()),
        agent_commission_marked_by = auth.uid(),
        updated_at = now()
    WHERE id = _contract_id
    RETURNING * INTO r;

  PERFORM public.notify_user(
    r.agent_id, 'payment',
    'Comissão marcada como paga',
    'O proprietário marcou sua comissão como paga.',
    '/financials'
  );
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_agent_commission_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_agent_commission_paid(uuid) TO authenticated;