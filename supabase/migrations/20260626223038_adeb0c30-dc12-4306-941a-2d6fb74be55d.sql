
-- 1) Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2) Allow has_unlock to be referenced inside RLS policies (SECURITY DEFINER still gates real reads)
GRANT EXECUTE ON FUNCTION public.has_unlock(UUID, UUID) TO authenticated;

-- 3) Tighten conversations INSERT: only initiator + must have unlock for that property
DROP POLICY IF EXISTS "Initiator creates conversation" ON public.conversations;
CREATE POLICY "Initiator creates conversation"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = initiator_id
    AND public.has_unlock(auth.uid(), property_id)
  );

-- 4) Tighten proposals INSERT similarly (tenant must be unlocked)
DROP POLICY IF EXISTS "Tenants insert proposals" ON public.proposals;
DROP POLICY IF EXISTS "Tenant creates proposal" ON public.proposals;
DROP POLICY IF EXISTS "tenants create proposals" ON public.proposals;
CREATE POLICY "Tenant creates proposal with unlock"
  ON public.proposals FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = tenant_id
    AND public.has_unlock(auth.uid(), property_id)
  );

-- 5) Daily cron: expire unlocks past their expires_at
SELECT cron.schedule(
  'expire-property-unlocks',
  '0 3 * * *',
  $$UPDATE public.property_unlocks
    SET status = 'expired', updated_at = now()
    WHERE status = 'paid'
      AND expires_at IS NOT NULL
      AND expires_at < now();$$
);
