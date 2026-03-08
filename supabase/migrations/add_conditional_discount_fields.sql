-- Add conditional discount support to client_product_pricing table
-- This migration adds columns for conditional discount functionality

-- Make price_rule_value nullable (required for conditional_discount type)
ALTER TABLE client_product_pricing
ALTER COLUMN price_rule_value DROP NOT NULL;

-- Add new columns for conditional discount
ALTER TABLE client_product_pricing
ADD COLUMN conditional_threshold NUMERIC(10, 4),
ADD COLUMN conditional_discount_below NUMERIC(10, 4),
ADD COLUMN conditional_discount_above_equal NUMERIC(10, 4);

-- Add comment to explain the columns
COMMENT ON COLUMN client_product_pricing.conditional_threshold IS 'Threshold amount for conditional discount. Applied when price_rule_type is conditional_discount.';
COMMENT ON COLUMN client_product_pricing.conditional_discount_below IS 'Discount (₹) to apply when amount is below conditional_threshold.';
COMMENT ON COLUMN client_product_pricing.conditional_discount_above_equal IS 'Discount (₹) to apply when amount is greater than or equal to conditional_threshold.';

-- Update the price_rule_type constraint to include conditional_discount
ALTER TABLE client_product_pricing
DROP CONSTRAINT IF EXISTS client_product_pricing_price_rule_type_check;

ALTER TABLE client_product_pricing
ADD CONSTRAINT client_product_pricing_price_rule_type_check
CHECK (price_rule_type IN ('discount_percentage', 'discount_flat', 'multiplier', 'flat_addition', 'conditional_discount'));