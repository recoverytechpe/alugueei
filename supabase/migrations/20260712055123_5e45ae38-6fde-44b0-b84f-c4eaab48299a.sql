
DROP POLICY IF EXISTS "Owners insert their own properties" ON public.properties;
DROP POLICY IF EXISTS "Owners update their own properties" ON public.properties;

CREATE POLICY "Only proprietario or agente can insert properties"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_id
  AND (
    public.has_role(auth.uid(), 'proprietario'::public.app_role)
    OR public.has_role(auth.uid(), 'agente'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "Only proprietario or agente can update own properties"
ON public.properties
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (
  auth.uid() = owner_id
  AND (
    public.has_role(auth.uid(), 'proprietario'::public.app_role)
    OR public.has_role(auth.uid(), 'agente'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);
