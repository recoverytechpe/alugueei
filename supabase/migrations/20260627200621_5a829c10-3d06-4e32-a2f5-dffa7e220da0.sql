ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_type TEXT CHECK (user_type IN ('locador','locatario','agente')),
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;