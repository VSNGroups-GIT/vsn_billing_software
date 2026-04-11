ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tagline TEXT;

ALTER TABLE public.invoice_templates
  ADD COLUMN IF NOT EXISTS company_tagline TEXT;
