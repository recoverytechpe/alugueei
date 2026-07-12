GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;
ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY DEFINER;