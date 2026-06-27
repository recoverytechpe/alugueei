
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_version TEXT;
