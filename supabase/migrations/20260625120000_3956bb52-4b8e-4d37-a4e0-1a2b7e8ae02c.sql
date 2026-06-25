ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS transfer_out_school TEXT;

COMMENT ON COLUMN public.students.transfer_out_school IS 'اسم المدرسة المحول إليها عند تحويل الطالب.';
