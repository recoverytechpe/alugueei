CREATE OR REPLACE FUNCTION public.get_public_agent_profile(_agent_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_agent boolean;
  prof record;
  agg record;
  closed_deals bigint;
  ratings json;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _agent_id AND role = 'agente') INTO is_agent;
  IF NOT is_agent THEN
    RETURN NULL;
  END IF;

  SELECT id, full_name, avatar_url, bio, created_at
    INTO prof FROM public.profiles WHERE id = _agent_id;
  IF prof.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(AVG(stars)::numeric(3,2), 0) AS avg_stars,
         COUNT(*)::bigint AS total_ratings
    INTO agg FROM public.agent_ratings WHERE agent_id = _agent_id;

  SELECT COUNT(*)::bigint INTO closed_deals
    FROM public.rental_contracts
    WHERE agent_id = _agent_id AND status IN ('closed','active');

  SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.created_at DESC), '[]'::json) INTO ratings
  FROM (
    SELECT stars, comment, created_at
    FROM public.agent_ratings
    WHERE agent_id = _agent_id
    ORDER BY created_at DESC
    LIMIT 10
  ) r;

  RETURN json_build_object(
    'id', prof.id,
    'full_name', prof.full_name,
    'avatar_url', prof.avatar_url,
    'bio', prof.bio,
    'member_since', prof.created_at,
    'avg_stars', agg.avg_stars,
    'total_ratings', agg.total_ratings,
    'closed_deals', closed_deals,
    'ratings', ratings
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_agent_profile(uuid) TO anon, authenticated;