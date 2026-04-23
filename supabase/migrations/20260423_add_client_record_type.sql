ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS client_record_type TEXT NOT NULL DEFAULT 'permanent'
  CHECK (client_record_type IN ('temporary', 'permanent'));
