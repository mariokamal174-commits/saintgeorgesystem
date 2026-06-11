
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installments TO authenticated;
GRANT ALL ON public.installments TO service_role;

DROP POLICY IF EXISTS "admin read audit" ON public.audit_logs;
CREATE POLICY "approved read audit" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS image_url TEXT;
