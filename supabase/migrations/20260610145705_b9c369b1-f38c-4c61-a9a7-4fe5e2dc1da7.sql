CREATE POLICY "finance update installments" ON public.installments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'finance'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'finance'::app_role));