
-- Add new student demographic + transfer fields
CREATE TYPE public.transfer_out_kind AS ENUM ('transfer', 'withdrawal');

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS birth_place text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS religion text,
  ADD COLUMN IF NOT EXISTS mother_name text,
  ADD COLUMN IF NOT EXISTS mother_national_id text,
  ADD COLUMN IF NOT EXISTS father_national_id text,
  ADD COLUMN IF NOT EXISTS guardian_job text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone2 text,
  ADD COLUMN IF NOT EXISTS is_transferred_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transfer_out_type public.transfer_out_kind,
  ADD COLUMN IF NOT EXISTS transfer_out_date date,
  ADD COLUMN IF NOT EXISTS archived_year text;

CREATE INDEX IF NOT EXISTS idx_students_archived_year ON public.students(archived_year);
CREATE INDEX IF NOT EXISTS idx_students_transfer_out ON public.students(transfer_out_type) WHERE transfer_out_type IS NOT NULL;

-- Allow student_affairs to delete students (in addition to admin)
DROP POLICY IF EXISTS "admin delete students" ON public.students;
CREATE POLICY "sa or admin delete students" ON public.students
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'student_affairs'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
