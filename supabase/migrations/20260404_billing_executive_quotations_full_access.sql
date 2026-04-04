-- Allow billing_executive full access to quotations (create, update, delete)

DROP POLICY IF EXISTS "Users can create quotations in their organization" ON public.quotations;
CREATE POLICY "Users can create quotations in their organization"
  ON public.quotations FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'billing_executive')
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can update quotations in their organization" ON public.quotations;
CREATE POLICY "Users can update quotations in their organization"
  ON public.quotations FOR UPDATE
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

DROP POLICY IF EXISTS "Privileged users can delete quotations" ON public.quotations;
CREATE POLICY "Privileged users can delete quotations"
  ON public.quotations FOR DELETE
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'billing_executive')
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "Authorized users can manage quotation items" ON public.quotation_items;
CREATE POLICY "Authorized users can manage quotation items"
  ON public.quotation_items FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.quotations q
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE q.id = quotation_items.quotation_id
        AND q.organization_id = public.get_user_organization(auth.uid())
        AND p.role IN ('super_admin', 'admin', 'billing_executive')
        AND p.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.quotations q
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE q.id = quotation_items.quotation_id
        AND q.organization_id = public.get_user_organization(auth.uid())
        AND p.role IN ('super_admin', 'admin', 'billing_executive')
        AND p.is_active = true
    )
  );
