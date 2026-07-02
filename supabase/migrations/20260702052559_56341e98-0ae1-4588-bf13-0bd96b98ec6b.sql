ALTER TABLE public.tenant_preapprovals
  ADD COLUMN IF NOT EXISTS share_as_lead boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_city text;

CREATE INDEX IF NOT EXISTS idx_tenant_preapprovals_lead
  ON public.tenant_preapprovals (preferred_city)
  WHERE share_as_lead = true;

CREATE OR REPLACE FUNCTION public.list_preapproval_leads(_city text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  initials text,
  city text,
  income_bucket text,
  guarantee_type text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'agente'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    tp.id,
    upper(left(regexp_replace(coalesce(pr.full_name,'?'), '\s+', ' ', 'g'), 1))
      || coalesce(
           upper(substr(split_part(pr.full_name,' ', 2), 1, 1)),
           ''
         ) AS initials,
    tp.preferred_city AS city,
    CASE
      WHEN tp.monthly_income < 3000  THEN 'até R$ 3 mil'
      WHEN tp.monthly_income < 6000  THEN 'R$ 3 mil – R$ 6 mil'
      WHEN tp.monthly_income < 10000 THEN 'R$ 6 mil – R$ 10 mil'
      WHEN tp.monthly_income < 20000 THEN 'R$ 10 mil – R$ 20 mil'
      ELSE 'acima de R$ 20 mil'
    END AS income_bucket,
    tp.guarantee_type,
    tp.created_at
  FROM public.tenant_preapprovals tp
  JOIN public.profiles pr ON pr.id = tp.user_id
  WHERE tp.share_as_lead = true
    AND (_city IS NULL OR _city = '' OR lower(tp.preferred_city) = lower(_city))
  ORDER BY tp.created_at DESC
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_signal_interest(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant uuid;
  agent_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'agente'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO tenant FROM public.tenant_preapprovals
    WHERE id = _lead_id AND share_as_lead = true;
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'lead not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT full_name INTO agent_name FROM public.profiles WHERE id = auth.uid();

  PERFORM public.notify_user(
    tenant,
    'affiliation',
    'Um agente demonstrou interesse',
    coalesce(agent_name,'Um agente') || ' pode ajudar você a encontrar um imóvel. Veja o perfil e responda se quiser conversar.',
    '/agents/' || auth.uid()::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_preapproval_leads(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_signal_interest(uuid) TO authenticated;