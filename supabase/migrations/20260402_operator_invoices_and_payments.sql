-- Operator Invoices: invoices received FROM operators
CREATE TABLE IF NOT EXISTS public.operator_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  taxable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid')),
  file_url TEXT,
  file_name TEXT,
  notes TEXT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Operator Payments: payments we make to operators against their invoices
CREATE TABLE IF NOT EXISTS public.operator_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_invoice_id UUID NOT NULL REFERENCES public.operator_invoices(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  reference_number TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  notes TEXT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_operator_invoices_operator_id ON public.operator_invoices(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_invoices_organization_id ON public.operator_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_operator_invoices_status ON public.operator_invoices(status);
CREATE INDEX IF NOT EXISTS idx_operator_payments_invoice_id ON public.operator_payments(operator_invoice_id);
CREATE INDEX IF NOT EXISTS idx_operator_payments_organization_id ON public.operator_payments(organization_id);

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_operator_invoices_updated_at ON public.operator_invoices;
CREATE TRIGGER update_operator_invoices_updated_at
  BEFORE UPDATE ON public.operator_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_operator_payments_updated_at ON public.operator_payments;
CREATE TRIGGER update_operator_payments_updated_at
  BEFORE UPDATE ON public.operator_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Prevent editing invoice details after first payment is recorded.
-- Keep amount/status editable for payment reconciliation flows.
CREATE OR REPLACE FUNCTION public.prevent_operator_invoice_edit_after_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.operator_payments op
    WHERE op.operator_invoice_id = NEW.id
  ) THEN
    IF NEW.operator_id IS DISTINCT FROM OLD.operator_id
      OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
      OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.taxable_amount IS DISTINCT FROM OLD.taxable_amount
      OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.file_url IS DISTINCT FROM OLD.file_url
      OR NEW.file_name IS DISTINCT FROM OLD.file_name
      OR NEW.notes IS DISTINCT FROM OLD.notes
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Invoice cannot be edited after payment is recorded';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_operator_invoice_edit_after_payment ON public.operator_invoices;
CREATE TRIGGER prevent_operator_invoice_edit_after_payment
  BEFORE UPDATE ON public.operator_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_operator_invoice_edit_after_payment();

-- RLS
ALTER TABLE public.operator_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage operator invoices in their org" ON public.operator_invoices;
CREATE POLICY "Users can manage operator invoices in their org"
  ON public.operator_invoices FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can manage operator payments in their org" ON public.operator_payments;
CREATE POLICY "Users can manage operator payments in their org"
  ON public.operator_payments FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));
