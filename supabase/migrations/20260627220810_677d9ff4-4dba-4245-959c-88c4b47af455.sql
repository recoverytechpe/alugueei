
REVOKE EXECUTE ON FUNCTION public.mark_agent_commission_paid(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_property_interest_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_agent_commission_paid(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.get_property_interest_counts(uuid[]) TO service_role;
