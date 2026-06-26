CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  initiator_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  contacts_unlocked boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (initiator_id <> recipient_id),
  UNIQUE (property_id, initiator_id, recipient_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants view conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (auth.uid() IN (initiator_id, recipient_id));
CREATE POLICY "Initiator creates conversation" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = initiator_id);
CREATE POLICY "Participants update conversation" ON public.conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (initiator_id, recipient_id))
  WITH CHECK (auth.uid() IN (initiator_id, recipient_id));

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_conversations_initiator ON public.conversations(initiator_id);
CREATE INDEX idx_conversations_recipient ON public.conversations(recipient_id);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants view messages" ON public.messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND auth.uid() IN (c.initiator_id, c.recipient_id)
  ));

CREATE POLICY "Participants send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND auth.uid() IN (c.initiator_id, c.recipient_id)
    )
  );

CREATE POLICY "Recipient marks read" ON public.messages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND auth.uid() IN (c.initiator_id, c.recipient_id)
      AND auth.uid() <> messages.sender_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND auth.uid() IN (c.initiator_id, c.recipient_id)
      AND auth.uid() <> messages.sender_id
  ));

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);

-- Bump conversation last_message_at on insert
CREATE OR REPLACE FUNCTION public.bump_conversation_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations
    SET last_message_at = NEW.created_at, updated_at = now()
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_bump_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_on_message();

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
