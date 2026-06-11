ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS activity_fees numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS education_fees numeric(12,2) NOT NULL DEFAULT 0;