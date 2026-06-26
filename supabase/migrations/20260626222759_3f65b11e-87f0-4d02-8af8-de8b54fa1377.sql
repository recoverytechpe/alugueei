
CREATE OR REPLACE FUNCTION public.auto_refund_on_reject()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  refunded_id uuid;
BEGIN
  IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    UPDATE public.property_unlocks
    SET status = 'refunded', updated_at = now()
    WHERE user_id = NEW.tenant_id
      AND property_id = NEW.property_id
      AND status = 'paid'
      AND paid_at > now() - interval '48 hours'
    RETURNING id INTO refunded_id;

    IF refunded_id IS NOT NULL THEN
      PERFORM public.notify_user(
        NEW.tenant_id,
        'payment',
        'Reembolso aprovado',
        'Sua taxa de desbloqueio foi estornada (proposta recusada em menos de 48h).',
        '/properties/' || NEW.property_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_refund_on_reject ON public.proposals;
CREATE TRIGGER trg_auto_refund_on_reject
AFTER UPDATE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.auto_refund_on_reject();

REVOKE EXECUTE ON FUNCTION public.auto_refund_on_reject() FROM PUBLIC, anon, authenticated;
