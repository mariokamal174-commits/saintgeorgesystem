-- Add golden_batch_fees column to students table
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS golden_batch_fees numeric(12,2) NOT NULL DEFAULT 0;

-- Update the total_due calculated column to include golden_batch_fees
ALTER TABLE public.students DROP COLUMN IF EXISTS total_due;
ALTER TABLE public.students ADD COLUMN total_due numeric(12,2) GENERATED ALWAYS AS
  (first_installment + second_installment + previous_installments + other_fees + activity_fees + education_fees + golden_batch_fees) STORED;

-- Update the remaining_balance calculated column to include golden_batch_fees
ALTER TABLE public.students DROP COLUMN IF EXISTS remaining_balance;
ALTER TABLE public.students ADD COLUMN remaining_balance numeric(12,2) GENERATED ALWAYS AS
  (first_installment + second_installment + previous_installments + other_fees + activity_fees + education_fees + golden_batch_fees - total_paid) STORED;
