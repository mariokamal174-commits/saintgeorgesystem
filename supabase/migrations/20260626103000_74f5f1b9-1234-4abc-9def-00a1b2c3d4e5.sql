-- Make student_code and national_id unique only for current-year students.
-- This allows archived student rows to keep their identifiers for history without blocking a new year's import.

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_student_code_key,
  DROP CONSTRAINT IF EXISTS students_national_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_code_current_year
  ON public.students (student_code)
  WHERE archived_year IS NULL AND student_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_nid_current_year
  ON public.students (national_id)
  WHERE archived_year IS NULL AND national_id IS NOT NULL;
