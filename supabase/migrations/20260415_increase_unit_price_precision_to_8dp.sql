-- Increase unit price and line total precision to 8 decimal places.
-- This allows pricing rules and invoice/quotation items to store
-- high-precision unit prices (e.g. 5.12345678) without rounding.

-- Pricing rules: all price columns → NUMERIC(18, 8)
ALTER TABLE public.client_product_pricing
  ALTER COLUMN fixed_base_value             TYPE NUMERIC(18, 8),
  ALTER COLUMN operator_price               TYPE NUMERIC(18, 8),
  ALTER COLUMN price_rule_value             TYPE NUMERIC(18, 8),
  ALTER COLUMN conditional_threshold        TYPE NUMERIC(18, 8),
  ALTER COLUMN conditional_discount_below   TYPE NUMERIC(18, 8),
  ALTER COLUMN conditional_discount_above_equal TYPE NUMERIC(18, 8);

-- Invoice items: unit_price and line_total → NUMERIC(18, 8)
ALTER TABLE public.invoice_items
  ALTER COLUMN unit_price TYPE NUMERIC(18, 8),
  ALTER COLUMN line_total TYPE NUMERIC(18, 8);

-- Quotation items: unit_price and line_total → NUMERIC(18, 8)
ALTER TABLE public.quotation_items
  ALTER COLUMN unit_price TYPE NUMERIC(18, 8),
  ALTER COLUMN line_total TYPE NUMERIC(18, 8);
