-- Allow billing_executive full access to clients (create, update, delete)

DROP POLICY IF EXISTS "Users can create clients in their organization" ON public.clients;
CREATE POLICY "Users can create clients in their organization"
  ON public.clients FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'billing_executive')
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can update clients in their organization" ON public.clients;
CREATE POLICY "Users can update clients in their organization"
  ON public.clients FOR UPDATE
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'billing_executive')
        AND p.is_active = true
    )
  )
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'billing_executive')
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "Privileged users can delete clients" ON public.clients;
CREATE POLICY "Privileged users can delete clients"
  ON public.clients FOR DELETE
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'billing_executive')
        AND p.is_active = true
    )
  );
