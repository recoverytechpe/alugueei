
-- =====================================================================
-- 1) admin_role_self_assign: whitelist roles allowed via signup metadata
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  safe_role public.app_role;
BEGIN
  IF requested IN ('proprietario','locatario','agente') THEN
    safe_role := requested::public.app_role;
  ELSE
    safe_role := 'locatario'::public.app_role;
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, cpf_cnpj)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'cpf_cnpj'
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, safe_role);
  RETURN NEW;
END;
$function$;

-- =====================================================================
-- 2) push_secret_hardcoded: store the shared secret in a locked-down
-- internal table; read it via SECURITY DEFINER helpers only.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public._app_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No GRANTs to anon/authenticated; only service_role and definer functions reach it.
REVOKE ALL ON public._app_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public._app_secrets TO service_role;
ALTER TABLE public._app_secrets ENABLE ROW LEVEL SECURITY;
-- No policies → no row is visible to anon/authenticated even if grants leak.

-- Insert a fresh random value on first apply; rotate if missing.
INSERT INTO public._app_secrets (name, value)
VALUES ('push_dispatch_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_push_dispatch_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT value FROM public._app_secrets WHERE name = 'push_dispatch_secret';
$$;

REVOKE ALL ON FUNCTION public.get_push_dispatch_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_push_dispatch_secret() TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_push(_user_id uuid, _title text, _body text, _url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  fn_url text := 'https://vvsoctvmctomovcebvli.supabase.co/functions/v1/push-dispatch';
  shared text;
BEGIN
  SELECT value INTO shared FROM public._app_secrets WHERE name = 'push_dispatch_secret';
  IF shared IS NULL OR shared = '' THEN
    RAISE NOTICE 'dispatch_push: shared secret not configured';
    RETURN;
  END IF;
  PERFORM extensions.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', shared),
    body := jsonb_build_object('user_id', _user_id, 'title', _title, 'body', _body, 'url', _url)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'dispatch_push failed: %', SQLERRM;
END;
$function$;

-- =====================================================================
-- 3) tenant_preapprovals_owner_can_read_all_proposals: scope to active proposals
-- =====================================================================
DROP POLICY IF EXISTS "Owners can view preapproval of tenants who proposed" ON public.tenant_preapprovals;
CREATE POLICY "Owners view preapproval of active tenant proposals"
ON public.tenant_preapprovals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.tenant_id = tenant_preapprovals.user_id
      AND p.owner_id = auth.uid()
      AND p.status IN ('pending','accepted','countered')
  )
);

-- =====================================================================
-- 4) properties_full_address_public: anon goes through view only, with
-- column-level grants that hide street/number/complement/cep.
-- =====================================================================
DROP POLICY IF EXISTS "Anon can view active properties (public columns via view)" ON public.properties;

GRANT SELECT ON public.properties_public TO anon, authenticated;
GRANT SELECT ON public.profiles_public TO anon, authenticated;
GRANT SELECT ON public.property_photos_public TO anon, authenticated;

REVOKE SELECT ON public.properties FROM anon;
GRANT SELECT (
  id, slug, title, description, property_type,
  neighborhood, city, state,
  bedrooms, bathrooms, parking_spots, area_m2,
  rent_value, condo_value, iptu_value, status,
  created_at, owner_id
) ON public.properties TO anon;

CREATE POLICY "Anon read available listings (safe columns only)"
ON public.properties
FOR SELECT
TO anon
USING (status = 'available'::property_status);

-- =====================================================================
-- 5) profiles_no_public_read_policy_but_missing_other_user_view:
-- column-level grants hide phone/cpf_cnpj from cross-user reads.
-- =====================================================================
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, full_name, avatar_url, bio, user_type, created_at) ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO service_role;

CREATE POLICY "Authenticated read safe profile columns"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- =====================================================================
-- 6) SUPA_* SECURITY DEFINER functions executable by anon/authenticated
-- =====================================================================
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_push(uuid, text, text, text)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maybe_close_contract()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_on_message()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_contract_on_accept()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_contact_attempt()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_visit()                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_proposal()                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_contract()                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_payment_inapp()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_visit_inapp()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_contract_inapp()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_proposal_inapp()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_unlock_owner()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_refund_on_reject()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_affiliation_approve()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_affiliation_request()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_property_rented_complete_affiliations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_block_messages_between_blocked()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_property_interest_counts(uuid[])       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_property_interest_counts(uuid[])       TO authenticated;
