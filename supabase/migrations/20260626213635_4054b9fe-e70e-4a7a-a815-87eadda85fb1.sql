
CREATE TABLE public.proposal_counters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rent_offer NUMERIC(12,2) NOT NULL CHECK (rent_offer > 0),
  term_months INTEGER NOT NULL CHECK (term_months > 0),
  start_date DATE NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_counters_proposal_id ON public.proposal_counters(proposal_id);
CREATE INDEX idx_proposal_counters_author_id ON public.proposal_counters(author_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_counters TO authenticated;
GRANT ALL ON public.proposal_counters TO service_role;

ALTER TABLE public.proposal_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View counters of own proposals"
ON public.proposal_counters FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_counters.proposal_id
      AND (p.owner_id = auth.uid() OR p.tenant_id = auth.uid())
  )
);

CREATE POLICY "Create counters as participant"
ON public.proposal_counters FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_counters.proposal_id
      AND (p.owner_id = auth.uid() OR p.tenant_id = auth.uid())
  )
);

CREATE POLICY "Update own counters"
ON public.proposal_counters FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_counters.proposal_id
      AND (p.owner_id = auth.uid() OR p.tenant_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_counters.proposal_id
      AND (p.owner_id = auth.uid() OR p.tenant_id = auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_proposal_counters_updated_at
BEFORE UPDATE ON public.proposal_counters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.proposal_counters;
