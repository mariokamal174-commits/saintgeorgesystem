
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installments TO authenticated;
GRANT ALL ON public.installments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_tracking TO authenticated;
GRANT ALL ON public.delivery_tracking TO service_role;
GRANT SELECT ON public.classes TO authenticated;
GRANT SELECT ON public.grades TO authenticated;

CREATE OR REPLACE FUNCTION public.recompute_student_totals(_student_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  paid NUMERIC(12,2); due NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO paid FROM public.receipts
    WHERE student_id = _student_id AND status = 'approved';
  UPDATE public.students SET total_paid = paid, updated_at = now()
    WHERE id = _student_id RETURNING total_due INTO due;
  UPDATE public.students SET payment_status = CASE
    WHEN paid >= due AND due > 0 THEN 'paid'::payment_status
    ELSE 'unpaid'::payment_status END
    WHERE id = _student_id;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_students_recompute_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.payment_status := CASE
    WHEN NEW.total_paid >= NEW.total_due AND NEW.total_due > 0 THEN 'paid'::payment_status
    ELSE 'unpaid'::payment_status END;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

UPDATE public.students SET payment_status = 'unpaid' WHERE payment_status = 'partial';
UPDATE public.installments SET status = 'unpaid' WHERE status = 'partial';
