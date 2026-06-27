ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS activity_fees numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS education_fees numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.students DROP COLUMN IF EXISTS total_due;
ALTER TABLE public.students ADD COLUMN total_due numeric(12,2) GENERATED ALWAYS AS
  (first_installment + second_installment + previous_installments + other_fees + activity_fees + education_fees) STORED;

ALTER TABLE public.students DROP COLUMN IF EXISTS remaining_balance;
ALTER TABLE public.students ADD COLUMN remaining_balance numeric(12,2) GENERATED ALWAYS AS
  (first_installment + second_installment + previous_installments + other_fees + activity_fees + education_fees - total_paid) STORED;
