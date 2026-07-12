ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS listed_by_agent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_listed_by_agent ON public.properties(listed_by_agent_id) WHERE listed_by_agent_id IS NOT NULL;

COMMENT ON COLUMN public.properties.listed_by_agent_id IS 'Optional: agent who captured/listed the property (may equal owner_id when agent registers themselves).';