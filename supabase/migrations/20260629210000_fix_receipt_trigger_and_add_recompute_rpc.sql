-- Fix: Ensure recompute_student_totals works correctly and is callable
-- Also add a callable RPC function for manual recompute

-- Re-create the trigger function to make sure it exists correctly
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
  -- Sum only approved receipts
  SELECT COALESCE(SUM(amount), 0)
    INTO paid
    FROM public.receipts
   WHERE student_id = _student_id
     AND status = 'approved';

  -- Update total_paid and get current total_due
  UPDATE public.students
     SET total_paid = paid,
         updated_at = now()
   WHERE id = _student_id
  RETURNING total_due INTO due;

  -- Update payment_status based on paid vs due
  UPDATE public.students
     SET payment_status = CASE
           WHEN paid >= due AND due > 0 THEN 'paid'::payment_status
           WHEN paid > 0               THEN 'partial'::payment_status
           ELSE                             'unpaid'::payment_status
         END
   WHERE id = _student_id;
END;
$$;

-- Re-create the trigger function
CREATE OR REPLACE FUNCTION public.trg_receipts_recompute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_student_totals(COALESCE(NEW.student_id, OLD.student_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop and recreate the trigger to make sure it's active
DROP TRIGGER IF EXISTS receipts_recompute_aiud ON public.receipts;
CREATE TRIGGER receipts_recompute_aiud
  AFTER INSERT OR UPDATE OR DELETE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.trg_receipts_recompute();

-- Grant EXECUTE on recompute_student_totals to authenticated so app can call it directly
-- This allows manual recompute via RPC from the frontend
REVOKE EXECUTE ON FUNCTION public.recompute_student_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_student_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_student_totals(uuid) TO service_role;

-- Add a safe public RPC wrapper for recomputing all students (admin/finance only)
CREATE OR REPLACE FUNCTION public.recompute_all_student_totals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
BEGIN
  -- Only allow finance/admin roles
  IF NOT (
    public.has_role(auth.uid(), 'finance') OR
    public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'غير مصرح: يجب أن تكون مديراً أو موظفاً مالياً';
  END IF;

  FOR s IN SELECT id FROM public.students LOOP
    PERFORM public.recompute_student_totals(s.id);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_all_student_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_all_student_totals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_student_totals() TO service_role;

-- Recompute all existing students now to fix any stuck data
SELECT public.recompute_student_totals(id) FROM public.students;
