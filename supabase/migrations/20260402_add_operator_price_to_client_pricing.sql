-- Add operator price to client pricing rules for margin visibility and reporting
ALTER TABLE public.client_product_pricing
ADD COLUMN IF NOT EXISTS operator_price NUMERIC(10, 4);

-- Backfill from product paper price where missing
UPDATE public.client_product_pricing cpp
SET operator_price = p.paper_price
FROM public.products p
WHERE cpp.product_id = p.id
  AND cpp.operator_price IS NULL;

-- Ensure the field is always available for calculations
ALTER TABLE public.client_product_pricing
ALTER COLUMN operator_price SET DEFAULT 0;

UPDATE public.client_product_pricing
SET operator_price = 0
WHERE operator_price IS NULL;

ALTER TABLE public.client_product_pricing
ALTER COLUMN operator_price SET NOT NULL;
