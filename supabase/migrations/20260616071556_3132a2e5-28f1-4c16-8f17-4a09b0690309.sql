REVOKE EXECUTE ON FUNCTION public.ensure_student_installments(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_student_installments_from_totals(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recompute_student_totals(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_student_payment_status(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_installments_recompute_student() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_receipts_recompute() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_student_payment_status(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_student_installments(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_student_installments_from_totals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_student_totals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_installments_recompute_student() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_receipts_recompute() TO service_role;