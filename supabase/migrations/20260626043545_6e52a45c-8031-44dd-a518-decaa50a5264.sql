
CREATE POLICY "Authenticated can read property photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'property-photos');

CREATE POLICY "Owners can upload their property photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Owners can update their property photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Owners can delete their property photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
