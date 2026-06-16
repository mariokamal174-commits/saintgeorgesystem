
DROP POLICY IF EXISTS "auth insert audit" ON public.audit_logs;
CREATE POLICY "approved insert own audit" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_approved(auth.uid()));

CREATE POLICY "finance admin update receipt-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'receipt-images'
    AND (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'admin')))
  WITH CHECK (bucket_id = 'receipt-images'
    AND (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "finance admin delete receipt-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipt-images'
    AND (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'admin')));
