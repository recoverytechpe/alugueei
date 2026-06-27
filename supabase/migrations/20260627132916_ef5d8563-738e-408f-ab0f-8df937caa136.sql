
-- 1) profiles: remove broad SELECT exposing CPF/phone to all authenticated users.
DROP POLICY IF EXISTS "Authenticated can view public profile rows" ON public.profiles;

-- 2) proposal_counters: restrict UPDATE to the author of the counter.
DROP POLICY IF EXISTS "Update own counters" ON public.proposal_counters;
CREATE POLICY "Update own counters"
ON public.proposal_counters
FOR UPDATE
TO authenticated
USING (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_counters.proposal_id
      AND (p.owner_id = auth.uid() OR p.tenant_id = auth.uid())
  )
)
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_counters.proposal_id
      AND (p.owner_id = auth.uid() OR p.tenant_id = auth.uid())
  )
);

-- 3) storage: restrict property-photos SELECT to owner OR available (non-deleted) property.
DROP POLICY IF EXISTS "Authenticated can read property photos" ON storage.objects;
CREATE POLICY "Authenticated can read property photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'property-photos'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(name))[2]
        AND p.status = 'available'
    )
  )
);

-- 4) SECURITY DEFINER functions: revoke EXECUTE from anon/public/authenticated
--    for functions that should only run from triggers or internal RLS evaluation.
--    has_role and has_unlock are referenced from RLS policies and are kept callable
--    by authenticated (used by app reads via PostgREST too); keep authenticated only.
REVOKE EXECUTE ON FUNCTION public.auto_refund_on_reject()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_on_message()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_contact_attempt()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_push(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_contract_on_accept()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maybe_close_contract()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_contract()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_contract_inapp()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_payment_inapp()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_proposal()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_proposal_inapp()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_unlock_owner()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_visit()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_visit_inapp()          FROM PUBLIC, anon, authenticated;

-- has_role / has_unlock: keep callable for app-level checks (used in policies & UI),
-- but revoke from anon since they should only be hit by signed-in users.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_unlock(uuid, uuid)          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_unlock(uuid, uuid)          TO authenticated;
