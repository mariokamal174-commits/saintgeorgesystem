-- Safe replacement functions: return early when student not found
-- Apply this migration in Supabase SQL editor or via psql

CREATE OR REPLACE FUNCTION public.ensure_student_installments(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.students%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.students WHERE id = _student_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.installments (student_id, label, amount, status, paid_amount)
  SELECT s.id, v.label, v.amount, 'unpaid'::payment_status, 0
  FROM (VALUES
    ('القسط الأول'::text, s.first_installment),
    ('القسط الثاني'::text, s.second_installment),
    ('أقساط سنوات سابقة'::text, s.previous_installments),
    ('رسوم أخرى'::text, s.other_fees)
  ) AS v(label, amount)
  WHERE COALESCE(v.amount, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.installments i
      WHERE i.student_id = s.id AND i.label = v.label
    );
END;
$$;

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
    RETURN;
  END IF;

  IF COALESCE(s.total_due, 0) > 0 AND COALESCE(s.total_paid, 0) >= COALESCE(s.total_due, 0) THEN
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
