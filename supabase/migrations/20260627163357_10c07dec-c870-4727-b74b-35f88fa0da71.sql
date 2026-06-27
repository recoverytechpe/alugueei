-- 1) tenant_ratings
CREATE TABLE IF NOT EXISTS public.tenant_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  stars int NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_ratings TO authenticated;
GRANT ALL ON public.tenant_ratings TO service_role;
ALTER TABLE public.tenant_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner creates rating" ON public.tenant_ratings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = rater_id AND EXISTS (
    SELECT 1 FROM public.rental_contracts c
    WHERE c.id = contract_id AND c.owner_id = auth.uid() AND c.tenant_id = tenant_ratings.tenant_id
  ));
CREATE POLICY "owner updates rating" ON public.tenant_ratings FOR UPDATE TO authenticated
  USING (auth.uid() = rater_id) WITH CHECK (auth.uid() = rater_id);
CREATE POLICY "owner deletes rating" ON public.tenant_ratings FOR DELETE TO authenticated
  USING (auth.uid() = rater_id);
CREATE POLICY "read rating" ON public.tenant_ratings FOR SELECT TO authenticated
  USING (auth.uid() = rater_id OR auth.uid() = tenant_id);

CREATE TRIGGER tenant_ratings_updated_at
  BEFORE UPDATE ON public.tenant_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_tenant_rating(_tenant_id uuid)
RETURNS TABLE(avg_stars numeric, total_ratings bigint)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT COALESCE(AVG(stars)::numeric(3,2), 0), COUNT(*)::bigint
  FROM public.tenant_ratings WHERE tenant_id = _tenant_id
$$;

-- 2) user_blocks
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manage own blocks" ON public.user_blocks FOR ALL TO authenticated
  USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);

-- 3) conversation_archives
CREATE TABLE IF NOT EXISTS public.conversation_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.conversation_archives TO authenticated;
GRANT ALL ON public.conversation_archives TO service_role;
ALTER TABLE public.conversation_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manage own archive" ON public.conversation_archives FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND (c.initiator_id = auth.uid() OR c.recipient_id = auth.uid())
    )
  );