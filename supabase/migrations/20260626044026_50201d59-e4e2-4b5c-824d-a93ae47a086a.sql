-- Switch aggregate function to SECURITY INVOKER (table policies allow read)
CREATE OR REPLACE FUNCTION public.get_agent_rating(_agent_id uuid)
RETURNS TABLE(avg_stars numeric, total_ratings bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT COALESCE(AVG(stars)::numeric(3,2), 0) AS avg_stars,
         COUNT(*)::bigint AS total_ratings
  FROM public.agent_ratings
  WHERE agent_id = _agent_id
$$;

-- Avatar storage bucket policies (bucket created via tool)
CREATE POLICY "Avatars are viewable by authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
