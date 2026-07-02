
-- 1) Drop broad SELECT policy on profiles exposing phone/CPF to all authenticated users
DROP POLICY IF EXISTS "Authenticated users can read profile directory rows" ON public.profiles;

-- 2) Lock down SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated
--    then re-grant only the ones intentionally callable from the client.
REVOKE EXECUTE ON FUNCTION public.agent_signal_interest(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_refund_on_reject() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_on_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_contact_attempt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_push(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_contract_on_accept() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_property_interest_counts(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_agent_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_push_dispatch_secret() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_preapproval_leads(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_agent_commission_paid(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maybe_close_contract() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_affiliation_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_block_messages_between_blocked() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_block_proposal_if_tenant_has_active_rental() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_contract() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_contract_inapp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_payment_inapp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_proposal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_proposal_inapp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_unlock_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_visit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_visit_inapp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_property_rented_complete_affiliations() FROM PUBLIC, anon, authenticated;

-- Re-grant only intentional client-callable RPCs:
-- Public route /agents/:id needs anon + authenticated access to the public profile RPC.
GRANT EXECUTE ON FUNCTION public.get_public_agent_profile(uuid) TO anon, authenticated;
-- Agent-only RPCs (in-function has_role check enforces authorization).
GRANT EXECUTE ON FUNCTION public.list_preapproval_leads(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_signal_interest(uuid) TO authenticated;

-- Trigger/internal helpers remain callable by service_role (bypasses grants) and by
-- triggers (which execute with the owner's rights), so no additional grants needed.
