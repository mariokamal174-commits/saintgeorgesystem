
CREATE POLICY "finance read receipt images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipt-images' AND (public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "finance upload receipt images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipt-images' AND (public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'admin')));
