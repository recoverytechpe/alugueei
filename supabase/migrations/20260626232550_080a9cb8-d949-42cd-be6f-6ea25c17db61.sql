CREATE OR REPLACE FUNCTION public.tg_notify_unlock_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner uuid;
  ptitle text;
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    SELECT owner_id, title INTO owner, ptitle FROM public.properties WHERE id = NEW.property_id;
    IF owner IS NOT NULL AND owner <> NEW.user_id THEN
      PERFORM public.notify_user(
        owner,
        'unlock',
        'Imóvel desbloqueado',
        'Um interessado desbloqueou "' || COALESCE(ptitle,'seu imóvel') || '" e pode entrar em contato.',
        '/properties/' || NEW.property_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_unlock_owner ON public.property_unlocks;
CREATE TRIGGER notify_unlock_owner
AFTER INSERT OR UPDATE OF status ON public.property_unlocks
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_unlock_owner();