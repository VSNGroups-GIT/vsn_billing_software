-- Enforce creator-role scoped visibility for invoices, payments, and quotations.
-- Rules:
-- 1) super_admin: can view/manage all documents in organization
-- 2) admin, billing_executive: can only view/manage docs created by admin or billing_executive
-- 3) accountant: invoices are visible for GST workflows; no write access to these domains

-- =========================
-- Invoices
-- =========================
DROP POLICY IF EXISTS "Users can view invoices in their organization" ON public.invoices;
CREATE POLICY "Users can view invoices in their organization"
  ON public.invoices FOR SELECT
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles viewer
      WHERE viewer.id = auth.uid()
        AND viewer.is_active = true
        AND (
          viewer.role = 'super_admin'
          OR viewer.role = 'accountant'
          OR (
            viewer.role IN ('admin', 'billing_executive')
            AND EXISTS (
              SELECT 1
              FROM public.profiles creator
              WHERE creator.id = invoices.created_by
                AND creator.organization_id = invoices.organization_id
                AND creator.role IN ('admin', 'billing_executive')
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Users can update invoices in their organization" ON public.invoices;
CREATE POLICY "Users can update invoices in their organization"
  ON public.invoices FOR UPDATE
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
              WHERE creator.id = invoices.created_by
                AND creator.organization_id = invoices.organization_id
                AND creator.role IN ('admin', 'billing_executive')
            )
          )
        )
    )
  )
  WITH CHECK (
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
              WHERE creator.id = invoices.created_by
                AND creator.organization_id = invoices.organization_id
                AND creator.role IN ('admin', 'billing_executive')
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Privileged users can delete invoices" ON public.invoices;
DROP POLICY IF EXISTS "Super Admins can delete invoices" ON public.invoices;
CREATE POLICY "Privileged users can delete invoices"
  ON public.invoices FOR DELETE
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
              WHERE creator.id = invoices.created_by
                AND creator.organization_id = invoices.organization_id
                AND creator.role IN ('admin', 'billing_executive')
            )
          )
        )
    )
  );

-- Invoice items must follow parent invoice visibility and management rules.
DROP POLICY IF EXISTS "Authenticated users can view invoice items" ON public.invoice_items;
CREATE POLICY "Authenticated users can view invoice items"
  ON public.invoice_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.profiles viewer ON viewer.id = auth.uid()
      LEFT JOIN public.profiles creator ON creator.id = i.created_by
      WHERE i.id = invoice_items.invoice_id
        AND i.organization_id = public.get_user_organization(auth.uid())
        AND viewer.is_active = true
        AND (
          viewer.role = 'super_admin'
          OR viewer.role = 'accountant'
          OR (
            viewer.role IN ('admin', 'billing_executive')
            AND creator.role IN ('admin', 'billing_executive')
          )
        )
    )
  );

DROP POLICY IF EXISTS "Authorized users can manage invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can manage invoice items" ON public.invoice_items;
CREATE POLICY "Authorized users can manage invoice items"
  ON public.invoice_items FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.profiles viewer ON viewer.id = auth.uid()
      LEFT JOIN public.profiles creator ON creator.id = i.created_by
      WHERE i.id = invoice_items.invoice_id
        AND i.organization_id = public.get_user_organization(auth.uid())
        AND viewer.is_active = true
        AND (
          viewer.role = 'super_admin'
          OR (
            viewer.role IN ('admin', 'billing_executive')
            AND creator.role IN ('admin', 'billing_executive')
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.profiles viewer ON viewer.id = auth.uid()
      LEFT JOIN public.profiles creator ON creator.id = i.created_by
      WHERE i.id = invoice_items.invoice_id
        AND i.organization_id = public.get_user_organization(auth.uid())
        AND viewer.is_active = true
        AND (
          viewer.role = 'super_admin'
          OR (
            viewer.role IN ('admin', 'billing_executive')
            AND creator.role IN ('admin', 'billing_executive')
          )
        )
    )
  );

-- =========================
-- Payments
-- =========================
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
        )
    )
  );

DROP POLICY IF EXISTS "Privileged users can update payments" ON public.payments;
DROP POLICY IF EXISTS "Super Admins can update payments" ON public.payments;
CREATE POLICY "Privileged users can update payments"
  ON public.payments FOR UPDATE
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
        )
    )
  )
  WITH CHECK (
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
        )
    )
  );

DROP POLICY IF EXISTS "Privileged users can delete payments" ON public.payments;
DROP POLICY IF EXISTS "Super Admins can delete payments" ON public.payments;
CREATE POLICY "Privileged users can delete payments"
  ON public.payments FOR DELETE
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
        )
    )
  );

-- =========================
-- Quotations
-- =========================
DROP POLICY IF EXISTS "Users can view quotations in their organization" ON public.quotations;
CREATE POLICY "Users can view quotations in their organization"
  ON public.quotations FOR SELECT
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
              WHERE creator.id = quotations.created_by
                AND creator.organization_id = quotations.organization_id
                AND creator.role IN ('admin', 'billing_executive')
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Users can update quotations in their organization" ON public.quotations;
CREATE POLICY "Users can update quotations in their organization"
  ON public.quotations FOR UPDATE
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
              WHERE creator.id = quotations.created_by
                AND creator.organization_id = quotations.organization_id
                AND creator.role IN ('admin', 'billing_executive')
            )
          )
        )
    )
  )
  WITH CHECK (
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
              WHERE creator.id = quotations.created_by
                AND creator.organization_id = quotations.organization_id
                AND creator.role IN ('admin', 'billing_executive')
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Privileged users can delete quotations" ON public.quotations;
DROP POLICY IF EXISTS "Super Admins can delete quotations" ON public.quotations;
CREATE POLICY "Privileged users can delete quotations"
  ON public.quotations FOR DELETE
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
              WHERE creator.id = quotations.created_by
                AND creator.organization_id = quotations.organization_id
                AND creator.role IN ('admin', 'billing_executive')
            )
          )
        )
    )
  );

-- Quotation items must follow parent quotation visibility and management rules.
DROP POLICY IF EXISTS "Authenticated users can view quotation items" ON public.quotation_items;
CREATE POLICY "Authenticated users can view quotation items"
  ON public.quotation_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.quotations q
      JOIN public.profiles viewer ON viewer.id = auth.uid()
      LEFT JOIN public.profiles creator ON creator.id = q.created_by
      WHERE q.id = quotation_items.quotation_id
        AND q.organization_id = public.get_user_organization(auth.uid())
        AND viewer.is_active = true
        AND (
          viewer.role = 'super_admin'
          OR (
            viewer.role IN ('admin', 'billing_executive')
            AND creator.role IN ('admin', 'billing_executive')
          )
        )
    )
  );

DROP POLICY IF EXISTS "Authorized users can manage quotation items" ON public.quotation_items;
DROP POLICY IF EXISTS "Authenticated users can manage quotation items" ON public.quotation_items;
CREATE POLICY "Authorized users can manage quotation items"
  ON public.quotation_items FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.quotations q
      JOIN public.profiles viewer ON viewer.id = auth.uid()
      LEFT JOIN public.profiles creator ON creator.id = q.created_by
      WHERE q.id = quotation_items.quotation_id
        AND q.organization_id = public.get_user_organization(auth.uid())
        AND viewer.is_active = true
        AND (
          viewer.role = 'super_admin'
          OR (
            viewer.role IN ('admin', 'billing_executive')
            AND creator.role IN ('admin', 'billing_executive')
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.quotations q
      JOIN public.profiles viewer ON viewer.id = auth.uid()
      LEFT JOIN public.profiles creator ON creator.id = q.created_by
      WHERE q.id = quotation_items.quotation_id
        AND q.organization_id = public.get_user_organization(auth.uid())
        AND viewer.is_active = true
        AND (
          viewer.role = 'super_admin'
          OR (
            viewer.role IN ('admin', 'billing_executive')
            AND creator.role IN ('admin', 'billing_executive')
          )
        )
    )
  );
