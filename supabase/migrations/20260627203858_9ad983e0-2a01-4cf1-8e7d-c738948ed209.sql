
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE public.properties ADD COLUMN slug TEXT;

CREATE OR REPLACE FUNCTION public.slugify(input TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT trim(both '-' from
    regexp_replace(
      regexp_replace(lower(public.unaccent(coalesce(input,''))), '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )
  )
$$;

UPDATE public.properties
SET slug = public.slugify(title) || '-' || substr(id::text, 1, 8)
WHERE slug IS NULL;

ALTER TABLE public.properties ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX properties_slug_unique ON public.properties(slug);

CREATE OR REPLACE FUNCTION public.properties_set_slug()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.slugify(NEW.title) || '-' || substr(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER properties_set_slug_trg
  BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.properties_set_slug();

CREATE OR REPLACE VIEW public.properties_public
WITH (security_invoker = true) AS
  SELECT id, slug, title, description, property_type,
         neighborhood, city, state,
         bedrooms, bathrooms, parking_spots, area_m2,
         rent_value, condo_value, iptu_value,
         created_at
  FROM public.properties
  WHERE status = 'available';

CREATE OR REPLACE VIEW public.property_photos_public
WITH (security_invoker = true) AS
  SELECT ph.id, ph.property_id, ph.storage_path, ph.position
  FROM public.property_photos ph
  JOIN public.properties p ON p.id = ph.property_id
  WHERE p.status = 'available';

-- anon read policies needed for security_invoker views
CREATE POLICY "Anon can view active properties (public columns via view)"
  ON public.properties FOR SELECT TO anon
  USING (status = 'available');

CREATE POLICY "Anon can view photos of active properties"
  ON public.property_photos FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_photos.property_id AND p.status = 'available'));

GRANT SELECT ON public.properties_public TO anon, authenticated;
GRANT SELECT ON public.property_photos_public TO anon, authenticated;
