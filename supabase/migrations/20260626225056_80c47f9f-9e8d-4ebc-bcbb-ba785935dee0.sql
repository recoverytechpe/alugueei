
ALTER TABLE public.property_unlocks
  ADD COLUMN IF NOT EXISTS lgpd_accepted_at TIMESTAMPTZ;

ALTER TABLE public.tenant_preapprovals
  ADD COLUMN IF NOT EXISTS rg_doc_path TEXT,
  ADD COLUMN IF NOT EXISTS cpf_doc_path TEXT,
  ADD COLUMN IF NOT EXISTS income_proof_path TEXT,
  ADD COLUMN IF NOT EXISTS docs_uploaded_at TIMESTAMPTZ;

-- Storage policies for new private bucket 'lead-documents'
-- Each user can manage only their own folder: lead-documents/<auth.uid()>/...
CREATE POLICY "Lead docs - users read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lead-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Lead docs - users insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Lead docs - users update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lead-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Lead docs - users delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lead-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
