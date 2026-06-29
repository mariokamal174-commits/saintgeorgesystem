-- Allow finance role to delete receipts
DROP POLICY IF EXISTS "admin delete receipts" ON public.receipts;
CREATE POLICY "admin delete receipts" ON public.receipts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- Allow finance role to write and delete installments
DROP POLICY IF EXISTS "sa write installments" ON public.installments;
CREATE POLICY "sa write installments" ON public.installments FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'student_affairs') OR 
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'finance')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'student_affairs') OR 
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'finance')
  );
