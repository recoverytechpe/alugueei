
CREATE OR REPLACE FUNCTION public.tg_block_proposal_if_tenant_has_active_rental()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.rental_contracts
    WHERE tenant_id = NEW.tenant_id
      AND status IN ('active','closed')
  ) THEN
    RAISE EXCEPTION 'Você já possui um contrato de aluguel ativo e não pode alugar outro imóvel.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_proposal_if_tenant_has_active_rental ON public.proposals;
CREATE TRIGGER block_proposal_if_tenant_has_active_rental
BEFORE INSERT ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.tg_block_proposal_if_tenant_has_active_rental();
