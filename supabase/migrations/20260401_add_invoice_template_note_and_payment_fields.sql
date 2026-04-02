ALTER TABLE public.invoice_templates
  ADD COLUMN IF NOT EXISTS note_content TEXT DEFAULT '1. Material once sold will not be taken back.\n2. Kindly verify quantity and amount before confirmation.',
  ADD COLUMN IF NOT EXISTS payment_instructions TEXT DEFAULT '1. Please make all payments to the company account only.\n2. Share payment confirmation with transaction reference.\n3. Contact billing support for any clarification.';
