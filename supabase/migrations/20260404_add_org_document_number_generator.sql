-- Collision-proof document number generation per organization.
-- Uses SECURITY DEFINER to avoid RLS visibility gaps during sequence generation.

-- Move uniqueness from global number to org-scoped number.
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_org_invoice_number_unique
  UNIQUE (organization_id, invoice_number);

ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_quotation_number_key;

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_org_quotation_number_unique
  UNIQUE (organization_id, quotation_number);

-- Internal counters per organization.
CREATE TABLE IF NOT EXISTS public.document_number_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  next_invoice_number BIGINT NOT NULL DEFAULT 1,
  next_quotation_number BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.document_number_sequences ENABLE ROW LEVEL SECURITY;

-- No direct table access for app roles.
REVOKE ALL ON public.document_number_sequences FROM PUBLIC;
REVOKE ALL ON public.document_number_sequences FROM anon;
REVOKE ALL ON public.document_number_sequences FROM authenticated;

CREATE OR REPLACE FUNCTION public.next_document_number(p_doc_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_next BIGINT;
  v_invoice_start BIGINT;
  v_quotation_start BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_org_id := public.get_user_organization(auth.uid());
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  IF p_doc_type NOT IN ('invoice', 'quotation') THEN
    RAISE EXCEPTION 'Unsupported document type: %', p_doc_type;
  END IF;

  -- Initialize organization counters from existing records once.
  SELECT COALESCE(MAX((regexp_match(i.invoice_number, '([0-9]+)$'))[1]::BIGINT), 0) + 1
    INTO v_invoice_start
  FROM public.invoices i
  WHERE i.organization_id = v_org_id;

  SELECT COALESCE(MAX((regexp_match(q.quotation_number, '([0-9]+)$'))[1]::BIGINT), 0) + 1
    INTO v_quotation_start
  FROM public.quotations q
  WHERE q.organization_id = v_org_id;

  INSERT INTO public.document_number_sequences (
    organization_id,
    next_invoice_number,
    next_quotation_number
  )
  VALUES (
    v_org_id,
    v_invoice_start,
    v_quotation_start
  )
  ON CONFLICT (organization_id) DO NOTHING;

  IF p_doc_type = 'invoice' THEN
    UPDATE public.document_number_sequences
    SET
      next_invoice_number = next_invoice_number + 1,
      updated_at = NOW()
    WHERE organization_id = v_org_id
    RETURNING next_invoice_number - 1 INTO v_next;

    RETURN 'INV-' || LPAD(v_next::TEXT, 4, '0');
  END IF;

  UPDATE public.document_number_sequences
  SET
    next_quotation_number = next_quotation_number + 1,
    updated_at = NOW()
  WHERE organization_id = v_org_id
  RETURNING next_quotation_number - 1 INTO v_next;

  RETURN 'Q-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_document_number(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_document_number(TEXT) TO authenticated;
