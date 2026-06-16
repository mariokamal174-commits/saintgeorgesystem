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
    RAISE EXCEPTION 'Student not found';
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
    RAISE EXCEPTION 'Student not found';
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
    WHEN paid >= due AND due > 0 THEN 'paid'::payment_status
    ELSE 'unpaid'::payment_status END
    WHERE id = _student_id;

  PERFORM public.sync_student_installments_from_totals(_student_id);
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

  UPDATE public.students
  SET total_paid = CASE WHEN _paid THEN COALESCE(total_due, 0) ELSE 0 END,
      payment_status = CASE WHEN _paid THEN 'paid'::payment_status ELSE 'unpaid'::payment_status END,
      updated_at = now()
  WHERE id = _student_id
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  UPDATE public.installments
  SET status = CASE WHEN _paid THEN 'paid'::payment_status ELSE 'unpaid'::payment_status END,
      paid_amount = CASE WHEN _paid THEN amount ELSE 0 END,
      updated_at = now()
  WHERE student_id = _student_id;

  RETURN result;
END;
$$;

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
        payment_status = CASE WHEN paid_total >= COALESCE(total_due, 0) AND COALESCE(total_due, 0) > 0 THEN 'paid'::payment_status ELSE 'unpaid'::payment_status END,
        updated_at = now()
    WHERE id = sid;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS installments_recompute_aiud ON public.installments;
CREATE TRIGGER installments_recompute_aiud
  AFTER UPDATE OF status ON public.installments
  FOR EACH ROW EXECUTE FUNCTION public.trg_installments_recompute_student();

GRANT EXECUTE ON FUNCTION public.ensure_student_installments(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_student_installments_from_totals(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_student_payment_status(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_student_totals(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_installments_recompute_student() TO authenticated, service_role;

SELECT public.ensure_student_installments(id) FROM public.students;
SELECT public.recompute_student_totals(id) FROM public.students;