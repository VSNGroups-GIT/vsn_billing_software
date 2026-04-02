ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS hsn_code TEXT;
