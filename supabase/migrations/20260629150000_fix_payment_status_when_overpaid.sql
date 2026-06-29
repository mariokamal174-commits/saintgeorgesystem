-- Fix: When total_paid >= total_due, remaining should be 0 (not negative) and status should be 'paid'

-- 1. Fix remaining_balance: clamp to zero (never negative)
ALTER TABLE public.students DROP COLUMN IF EXISTS remaining_balance;
ALTER TABLE public.students ADD COLUMN remaining_balance numeric(12,2) GENERATED ALWAYS AS
  (GREATEST(first_installment + second_installment + previous_installments + other_fees + activity_fees + golden_batch_fees - total_paid, 0)) STORED;

-- 2. Fix recompute_student_totals: paid >= due means 'paid', even if due = 0 and paid > 0
CREATE OR REPLACE FUNCTION public.recompute_student_totals(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paid NUMERIC(12,2);
  due NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO paid FROM public.receipts
    WHERE student_id = _student_id AND status = 'approved';

  UPDATE public.students SET total_paid = paid, updated_at = now()
    WHERE id = _student_id RETURNING total_due INTO due;

  UPDATE public.students SET payment_status = CASE
    WHEN paid >= due THEN 'paid'::payment_status
    ELSE 'unpaid'::payment_status END
    WHERE id = _student_id;

  PERFORM public.sync_student_installments_from_totals(_student_id);
END;
$$;

-- 3. Fix trg_installments_recompute_student: same logic
CREATE OR REPLACE FUNCTION public.trg_installments_recompute_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid uuid;
  total numeric(12,2);
  paid_total numeric(12,2);
BEGIN
  sid := COALESCE(NEW.student_id, OLD.student_id);

  SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0)
  INTO total, paid_total
  FROM public.installments
  WHERE student_id = sid;

  IF total > 0 THEN
    UPDATE public.students
    SET total_paid = paid_total,
        payment_status = CASE WHEN paid_total >= COALESCE(total_due, 0) THEN 'paid'::payment_status ELSE 'unpaid'::payment_status END,
        updated_at = now()
    WHERE id = sid;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. Fix sync_student_installments_from_totals: same logic
CREATE OR REPLACE FUNCTION public.sync_student_installments_from_totals(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  PERFORM public.ensure_student_installments(_student_id);

  SELECT total_paid, total_due INTO s FROM public.students WHERE id = _student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  IF COALESCE(s.total_paid, 0) >= COALESCE(s.total_due, 0) THEN
    UPDATE public.installments
    SET status = 'paid'::payment_status,
        paid_amount = amount,
        updated_at = now()
    WHERE student_id = _student_id;
  ELSE
    UPDATE public.installments
    SET status = 'unpaid'::payment_status,
        paid_amount = 0,
        updated_at = now()
    WHERE student_id = _student_id;
  END IF;
END;
$$;

-- 5. Recompute all students to fix existing data
SELECT public.recompute_student_totals(id) FROM public.students;
