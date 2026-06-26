REVOKE EXECUTE ON FUNCTION public.generate_contract_on_accept() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maybe_close_contract() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_on_message() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;