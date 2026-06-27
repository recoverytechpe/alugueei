
CREATE OR REPLACE FUNCTION public.tg_block_messages_between_blocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  other_id uuid;
BEGIN
  SELECT CASE WHEN c.initiator_id = NEW.sender_id THEN c.recipient_id ELSE c.initiator_id END
    INTO other_id
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF other_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = NEW.sender_id AND blocked_id = other_id)
       OR (blocker_id = other_id AND blocked_id = NEW.sender_id)
  ) THEN
    RAISE EXCEPTION 'Mensagem bloqueada: existe bloqueio entre os participantes.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_messages_between_blocked ON public.messages;
CREATE TRIGGER block_messages_between_blocked
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.tg_block_messages_between_blocked();
