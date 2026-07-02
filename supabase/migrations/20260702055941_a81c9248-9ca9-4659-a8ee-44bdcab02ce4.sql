
CREATE OR REPLACE FUNCTION public.list_preapproval_leads(_city text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, initials text, city text, income_bucket text, guarantee_type text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'agente'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    tp.id,
    upper(left(regexp_replace(coalesce(pr.full_name,'?'), '\s+', ' ', 'g'), 1))
      || coalesce(upper(substr(split_part(pr.full_name,' ', 2), 1, 1)), '') AS initials,
    tp.preferred_city::text AS city,
    (CASE
      WHEN tp.monthly_income < 3000  THEN 'até R$ 3 mil'
      WHEN tp.monthly_income < 6000  THEN 'R$ 3 mil – R$ 6 mil'
      WHEN tp.monthly_income < 10000 THEN 'R$ 6 mil – R$ 10 mil'
      WHEN tp.monthly_income < 20000 THEN 'R$ 10 mil – R$ 20 mil'
      ELSE 'acima de R$ 20 mil'
    END)::text AS income_bucket,
    tp.guarantee_type::text AS guarantee_type,
    tp.created_at
  FROM public.tenant_preapprovals tp
  JOIN public.profiles pr ON pr.id = tp.user_id
  WHERE tp.share_as_lead = true
    AND (_city IS NULL OR _city = '' OR lower(tp.preferred_city) = lower(_city))
  ORDER BY tp.created_at DESC
  LIMIT 100;
END;
$function$;
