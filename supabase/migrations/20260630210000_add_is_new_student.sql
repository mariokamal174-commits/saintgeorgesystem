-- Add is_new_student column to students table
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS is_new_student boolean NOT NULL DEFAULT false;
