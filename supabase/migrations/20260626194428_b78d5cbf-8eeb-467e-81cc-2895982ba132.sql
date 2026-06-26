ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS tenant_preapproval_income NUMERIC,
  ADD COLUMN IF NOT EXISTS tenant_preapproval_max_rent NUMERIC,
  ADD COLUMN IF NOT EXISTS tenant_preapproval_guarantee TEXT;