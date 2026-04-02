-- Create operators master table
CREATE TABLE IF NOT EXISTS public.operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep operator names unique per organization
CREATE UNIQUE INDEX IF NOT EXISTS operators_org_name_unique
ON public.operators (organization_id, lower(name));

-- Add operator mapping on products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES public.operators(id) ON DELETE RESTRICT;

-- Optional lookup helpers
CREATE INDEX IF NOT EXISTS operators_org_idx
ON public.operators (organization_id, is_active);

CREATE INDEX IF NOT EXISTS products_operator_idx
ON public.products (operator_id);
