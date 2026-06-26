ALTER TABLE public.visits REPLICA IDENTITY FULL;
ALTER TABLE public.rental_contracts REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.visits; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rental_contracts; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;