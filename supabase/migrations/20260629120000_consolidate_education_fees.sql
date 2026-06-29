-- Consolidate education_fees into first_installment
-- This migration removes education_fees from separate tracking and includes them in installment amounts

-- Update the total_due calculated column to exclude education_fees
ALTER TABLE public.students DROP COLUMN IF EXISTS total_due;
ALTER TABLE public.students ADD COLUMN total_due numeric(12,2) GENERATED ALWAYS AS
  (first_installment + second_installment + previous_installments + other_fees + activity_fees + golden_batch_fees) STORED;

-- Update the remaining_balance calculated column to exclude education_fees
ALTER TABLE public.students DROP COLUMN IF EXISTS remaining_balance;
ALTER TABLE public.students ADD COLUMN remaining_balance numeric(12,2) GENERATED ALWAYS AS
  (first_installment + second_installment + previous_installments + other_fees + activity_fees + golden_batch_fees - total_paid) STORED;

-- Note: We keep education_fees column on both students and receipts tables for backward compatibility and historical tracking,
-- but it is no longer used in fee calculations. New education fees should be added to first_installment.
