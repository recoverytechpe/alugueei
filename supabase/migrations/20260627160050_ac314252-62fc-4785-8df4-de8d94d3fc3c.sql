CREATE OR REPLACE FUNCTION public.get_property_interest_counts(_property_ids uuid[])
RETURNS TABLE(property_id uuid, interested_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (SELECT unnest(_property_ids) AS pid),
  users AS (
    SELECT property_id AS pid, user_id AS uid FROM public.favorites WHERE property_id = ANY(_property_ids)
    UNION
    SELECT property_id AS pid, tenant_id AS uid FROM public.proposals WHERE property_id = ANY(_property_ids)
  )
  SELECT ids.pid, COALESCE(COUNT(DISTINCT users.uid), 0)::bigint
  FROM ids LEFT JOIN users ON users.pid = ids.pid
  GROUP BY ids.pid;
$$;

GRANT EXECUTE ON FUNCTION public.get_property_interest_counts(uuid[]) TO authenticated, anon;