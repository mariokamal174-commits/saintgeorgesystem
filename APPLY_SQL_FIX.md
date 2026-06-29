# Fix: تطبيق هذا الـ SQL في Supabase Dashboard → SQL Editor

## الخطوات:
1. افتح https://supabase.com/dashboard/project/rvbtjytipbjmnikrsfbw
2. من القائمة الجانبية: SQL Editor
3. الصق الكود التالي واضغط Run

```sql
-- Fix receipt trigger and grant recompute functions to authenticated users

-- Re-create recompute_student_totals with correct logic
CREATE OR REPLACE FUNCTION public.recompute_student_totals(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paid NUMERIC(12,2);
  due  NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0)
    INTO paid
    FROM public.receipts
   WHERE student_id = _student_id
     AND status = 'approved';

  UPDATE public.students
     SET total_paid = paid,
         updated_at = now()
   WHERE id = _student_id
  RETURNING total_due INTO due;

  UPDATE public.students
     SET payment_status = CASE
           WHEN paid >= due AND due > 0 THEN 'paid'::payment_status
           WHEN paid > 0               THEN 'partial'::payment_status
           ELSE                             'unpaid'::payment_status
         END
   WHERE id = _student_id;
END;
$$;

-- Re-create trigger function
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

-- Recreate trigger
DROP TRIGGER IF EXISTS receipts_recompute_aiud ON public.receipts;
CREATE TRIGGER receipts_recompute_aiud
  AFTER INSERT OR UPDATE OR DELETE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.trg_receipts_recompute();

-- Grant to authenticated (for RPC calls from the app)
REVOKE EXECUTE ON FUNCTION public.recompute_student_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_student_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_student_totals(uuid) TO service_role;

-- Add recompute_all wrapper (admin/finance only)
CREATE OR REPLACE FUNCTION public.recompute_all_student_totals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  FOR s IN SELECT id FROM public.students LOOP
    PERFORM public.recompute_student_totals(s.id);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_all_student_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_all_student_totals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_student_totals() TO service_role;

-- Fix existing data NOW
SELECT public.recompute_student_totals(id) FROM public.students;
```
