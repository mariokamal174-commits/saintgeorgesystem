CREATE OR REPLACE FUNCTION public.trg_students_recompute_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  due numeric(12,2);
BEGIN
  due := COALESCE(NEW.first_installment, 0)
       + COALESCE(NEW.second_installment, 0)
       + COALESCE(NEW.previous_installments, 0)
       + COALESCE(NEW.other_fees, 0);

  NEW.payment_status := CASE
    WHEN COALESCE(NEW.total_paid, 0) >= due AND due > 0 THEN 'paid'::payment_status
    ELSE 'unpaid'::payment_status END;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_student_payment_status(_student_id uuid, _paid boolean)
RETURNS public.students
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.students%ROWTYPE;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  PERFORM public.ensure_student_installments(_student_id);

  UPDATE public.installments
  SET status = CASE WHEN _paid THEN 'paid'::payment_status ELSE 'unpaid'::payment_status END,
      paid_amount = CASE WHEN _paid THEN amount ELSE 0 END,
      updated_at = now()
  WHERE student_id = _student_id;

  UPDATE public.students
  SET total_paid = CASE WHEN _paid THEN COALESCE(total_due, 0) ELSE 0 END,
      updated_at = now()
  WHERE id = _student_id
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  RETURN result;
END;
$$;

UPDATE public.students
SET total_paid = total_paid,
    updated_at = now();