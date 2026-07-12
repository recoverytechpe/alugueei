REVOKE EXECUTE ON FUNCTION public.list_preapproval_leads(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.agent_signal_interest(uuid) FROM anon, authenticated, PUBLIC;