DROP POLICY IF EXISTS "Users can view payments in their organization" ON public.payments;

CREATE POLICY "Users can view payments in their organization"
  ON public.payments FOR SELECT
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles viewer
      WHERE viewer.id = auth.uid()
        AND viewer.is_active = true
        AND (
          viewer.role = 'super_admin'
          OR (
            viewer.role IN ('admin', 'billing_executive')
            AND EXISTS (
              SELECT 1
              FROM public.profiles creator
              WHERE creator.id = payments.created_by
                AND creator.organization_id = payments.organization_id
                AND creator.role IN ('admin', 'billing_executive')
            )
          )
          OR (
            viewer.role = 'accountant'
            AND EXISTS (
              SELECT 1
              FROM public.invoices i
              JOIN public.clients c ON c.id = i.client_id
              WHERE i.id = payments.invoice_id
                AND i.status = 'paid'
                AND c.tax_id IS NOT NULL
                AND c.tax_id != ''
                AND c.tax_id NOT ILIKE 'no gst%'
            )
          )
        )
    )
  );
