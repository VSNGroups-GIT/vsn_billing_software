ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS sector TEXT,
ADD COLUMN IF NOT EXISTS through_mediator BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS mediator_deduction_type TEXT
  CHECK (mediator_deduction_type IN ('percentage', 'amount')),
ADD COLUMN IF NOT EXISTS mediator_percentage NUMERIC(10, 4),
ADD COLUMN IF NOT EXISTS mediator_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount NUMERIC(10, 2);

UPDATE public.payments
SET net_amount = COALESCE(amount, 0) - COALESCE(mediator_amount, 0)
WHERE net_amount IS NULL;
