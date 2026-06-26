
REVOKE EXECUTE ON FUNCTION public.has_unlock(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_unlock(UUID, UUID) TO service_role;
