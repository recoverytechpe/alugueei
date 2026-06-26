
REVOKE EXECUTE ON FUNCTION public.dispatch_push(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_proposal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_visit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_contract() FROM PUBLIC, anon, authenticated;
