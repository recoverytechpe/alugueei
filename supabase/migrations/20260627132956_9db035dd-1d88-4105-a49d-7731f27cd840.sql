
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_unlock(_user_id uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = _property_id AND p.owner_id = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.property_unlocks u
      WHERE u.user_id = _user_id
        AND u.property_id = _property_id
        AND u.status = 'paid'
        AND (u.expires_at IS NULL OR u.expires_at > now())
    );
$$;
