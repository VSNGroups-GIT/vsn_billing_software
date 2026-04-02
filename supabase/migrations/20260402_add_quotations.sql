-- Quotations module: supports whatsapp/other formats and conversion tracking to invoices
CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT NOT NULL UNIQUE,
  reference_number TEXT UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  quotation_type TEXT NOT NULL DEFAULT 'other' CHECK (quotation_type IN ('whatsapp', 'other')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('draft', 'recorded', 'converted', 'cancelled')),
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  converted_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  line_total NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotations_client_id ON public.quotations(client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_org_id ON public.quotations(organization_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id ON public.quotation_items(quotation_id);

DROP TRIGGER IF EXISTS update_quotations_updated_at ON public.quotations;
CREATE TRIGGER update_quotations_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view quotations in their organization" ON public.quotations;
CREATE POLICY "Users can view quotations in their organization"
  ON public.quotations FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can create quotations in their organization" ON public.quotations;
CREATE POLICY "Users can create quotations in their organization"
  ON public.quotations FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Users can update quotations in their organization" ON public.quotations;
CREATE POLICY "Users can update quotations in their organization"
  ON public.quotations FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can delete quotations" ON public.quotations;
CREATE POLICY "Super Admins can delete quotations"
  ON public.quotations FOR DELETE
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view quotation items" ON public.quotation_items;
CREATE POLICY "Authenticated users can view quotation items"
  ON public.quotation_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can manage quotation items" ON public.quotation_items;
CREATE POLICY "Authenticated users can manage quotation items"
  ON public.quotation_items FOR ALL
  USING (auth.uid() IS NOT NULL);
