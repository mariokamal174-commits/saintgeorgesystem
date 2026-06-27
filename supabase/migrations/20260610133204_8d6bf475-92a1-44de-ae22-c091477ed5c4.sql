
-- ============ ENUMS ============
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'student_affairs', 'finance');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'account_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.account_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'payment_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.payment_status AS ENUM ('paid', 'partial', 'unpaid');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'receipt_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.receipt_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END$$;

-- ============ PROFILES ============
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  department app_role NOT NULL,
  status account_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ USER ROLES ============
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- ============ SECURITY DEFINER ROLE CHECK ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'approved')
$$;

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dep app_role;
BEGIN
  dep := COALESCE((NEW.raw_user_meta_data->>'department')::app_role, 'student_affairs');
  INSERT INTO public.profiles (id, full_name, username, department, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)),
    dep,
    'pending'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- When profile is approved, assign role matching department
CREATE OR REPLACE FUNCTION public.handle_profile_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, NEW.department)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_approved ON public.profiles;
CREATE TRIGGER on_profile_approved
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_approval();

-- ============ GRADES & CLASSES ============
CREATE TABLE IF NOT EXISTS public.grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  level INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id UUID REFERENCES public.grades(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  academic_year TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ STUDENTS ============
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_code TEXT UNIQUE,
  national_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  guardian_name TEXT,
  phone TEXT,
  grade_id UUID REFERENCES public.grades(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  first_installment NUMERIC(12,2) NOT NULL DEFAULT 0,
  second_installment NUMERIC(12,2) NOT NULL DEFAULT 0,
  previous_installments NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_fees NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_due NUMERIC(12,2) GENERATED ALWAYS AS
    (first_installment + second_installment + previous_installments + other_fees) STORED,
  remaining_balance NUMERIC(12,2) GENERATED ALWAYS AS
    (first_installment + second_installment + previous_installments + other_fees - total_paid) STORED,
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_students_name' AND relkind = 'i') THEN
    CREATE INDEX idx_students_name ON public.students USING gin (to_tsvector('simple', full_name));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_students_code' AND relkind = 'i') THEN
    CREATE INDEX idx_students_code ON public.students(student_code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_students_nid' AND relkind = 'i') THEN
    CREATE INDEX idx_students_nid ON public.students(national_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_students_class' AND relkind = 'i') THEN
    CREATE INDEX idx_students_class ON public.students(class_id);
  END IF;
END$$;

-- ============ INSTALLMENTS (per student detail) ============
CREATE TABLE IF NOT EXISTS public.installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status payment_status NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_installments_student' AND relkind = 'i') THEN
    CREATE INDEX idx_installments_student ON public.installments(student_id);
  END IF;
END$$;

-- ============ RECEIPTS ============
CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id UUID REFERENCES public.installments(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  receipt_number TEXT,
  receipt_date DATE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payer_name TEXT,
  file_url TEXT,
  ocr_confidence NUMERIC(5,2),
  ocr_raw JSONB,
  status receipt_status NOT NULL DEFAULT 'pending',
  uploaded_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_receipts_student' AND relkind = 'i') THEN
    CREATE INDEX idx_receipts_student ON public.receipts(student_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_receipts_status' AND relkind = 'i') THEN
    CREATE INDEX idx_receipts_status ON public.receipts(status);
  END IF;
END$$;

-- Recompute student totals when receipts approved
CREATE OR REPLACE FUNCTION public.recompute_student_totals(_student_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  paid NUMERIC(12,2);
  rem NUMERIC(12,2);
  due NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO paid FROM public.receipts
    WHERE student_id = _student_id AND status = 'approved';
  UPDATE public.students SET total_paid = paid, updated_at = now()
    WHERE id = _student_id RETURNING remaining_balance, total_due INTO rem, due;
  UPDATE public.students SET payment_status = CASE
    WHEN paid >= due AND due > 0 THEN 'paid'::payment_status
    WHEN paid > 0 THEN 'partial'::payment_status
    ELSE 'unpaid'::payment_status END
    WHERE id = _student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_receipts_recompute()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_student_totals(COALESCE(NEW.student_id, OLD.student_id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS receipts_recompute_aiud ON public.receipts;
CREATE TRIGGER receipts_recompute_aiud
  AFTER INSERT OR UPDATE OR DELETE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.trg_receipts_recompute();

CREATE OR REPLACE FUNCTION public.trg_students_recompute_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.payment_status := CASE
    WHEN NEW.total_paid >= NEW.total_due AND NEW.total_due > 0 THEN 'paid'::payment_status
    WHEN NEW.total_paid > 0 THEN 'partial'::payment_status
    ELSE 'unpaid'::payment_status END;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS students_recompute_biu ON public.students;
CREATE TRIGGER students_recompute_biu
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.trg_students_recompute_status();

-- ============ DELIVERY TRACKING ============
CREATE TABLE IF NOT EXISTS public.delivery_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  delivered BOOLEAN NOT NULL DEFAULT FALSE,
  delivered_at TIMESTAMPTZ,
  delivered_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ STUDENT IMPORTS ============
CREATE TABLE IF NOT EXISTS public.student_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT,
  file_url TEXT,
  rows_total INT DEFAULT 0,
  rows_inserted INT DEFAULT 0,
  rows_updated INT DEFAULT 0,
  rows_skipped INT DEFAULT 0,
  imported_by UUID REFERENCES auth.users(id),
  summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ AUDIT LOGS ============
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_audit_entity' AND relkind = 'i') THEN
    CREATE INDEX idx_audit_entity ON public.audit_logs(entity, entity_id);
  END IF;
END$$;

-- ============ NOTIFICATIONS ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_notif_user' AND relkind = 'i') THEN
    CREATE INDEX idx_notif_user ON public.notifications(user_id, read);
  END IF;
END$$;

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_tracking TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_imports TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.profiles, public.user_roles, public.grades, public.classes,
  public.students, public.installments, public.receipts, public.delivery_tracking,
  public.student_imports, public.audit_logs, public.notifications TO service_role;

-- ============ RLS ============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "view own profile" ON public.profiles;
DROP POLICY IF EXISTS "update own profile" ON public.profiles;
DROP POLICY IF EXISTS "admin insert profile" ON public.profiles;
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
DROP POLICY IF EXISTS "approved read grades" ON public.grades;
DROP POLICY IF EXISTS "admin manage grades" ON public.grades;
DROP POLICY IF EXISTS "approved read classes" ON public.classes;
DROP POLICY IF EXISTS "admin manage classes" ON public.classes;
DROP POLICY IF EXISTS "approved read students" ON public.students;
DROP POLICY IF EXISTS "sa insert students" ON public.students;
DROP POLICY IF EXISTS "sa update students" ON public.students;
DROP POLICY IF EXISTS "admin delete students" ON public.students;
DROP POLICY IF EXISTS "approved read installments" ON public.installments;
DROP POLICY IF EXISTS "sa write installments" ON public.installments;
DROP POLICY IF EXISTS "approved read receipts" ON public.receipts;
DROP POLICY IF EXISTS "finance insert receipts" ON public.receipts;
DROP POLICY IF EXISTS "finance update receipts" ON public.receipts;
DROP POLICY IF EXISTS "admin delete receipts" ON public.receipts;
DROP POLICY IF EXISTS "approved read delivery" ON public.delivery_tracking;
DROP POLICY IF EXISTS "sa write delivery" ON public.delivery_tracking;
DROP POLICY IF EXISTS "sa read imports" ON public.student_imports;
DROP POLICY IF EXISTS "sa insert imports" ON public.student_imports;
DROP POLICY IF EXISTS "admin read audit" ON public.audit_logs;
DROP POLICY IF EXISTS "auth insert audit" ON public.audit_logs;
DROP POLICY IF EXISTS "own notifications" ON public.notifications;

CREATE POLICY "view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin insert profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- user_roles: read own + admin manage
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- grades & classes: any approved user reads; admin manages
CREATE POLICY "approved read grades" ON public.grades FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "admin manage grades" ON public.grades FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "approved read classes" ON public.classes FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "admin manage classes" ON public.classes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- students: approved users read; student_affairs + admin write, finance can update installments
CREATE POLICY "approved read students" ON public.students FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "sa insert students" ON public.students FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'student_affairs') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "sa update students" ON public.students FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'student_affairs') OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'student_affairs') OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete students" ON public.students FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- installments
CREATE POLICY "approved read installments" ON public.installments FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "sa write installments" ON public.installments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'student_affairs') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'student_affairs') OR public.has_role(auth.uid(),'admin'));

-- receipts: finance writes, all approved read
CREATE POLICY "approved read receipts" ON public.receipts FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "finance insert receipts" ON public.receipts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "finance update receipts" ON public.receipts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete receipts" ON public.receipts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- delivery tracking: SA writes
CREATE POLICY "approved read delivery" ON public.delivery_tracking FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "sa write delivery" ON public.delivery_tracking FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'student_affairs') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'student_affairs') OR public.has_role(auth.uid(),'admin'));

-- imports: SA/admin
CREATE POLICY "sa read imports" ON public.student_imports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'student_affairs') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "sa insert imports" ON public.student_imports FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'student_affairs') OR public.has_role(auth.uid(),'admin'));

-- audit logs: admin reads all; user reads own; anyone authenticated can insert
CREATE POLICY "admin read audit" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR user_id = auth.uid());
CREATE POLICY "auth insert audit" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- notifications: own
CREATE POLICY "own notifications" ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- ============ REALTIME ============
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel rel
    JOIN pg_class cls ON cls.oid = rel.prrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE rel.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
      AND ns.nspname = 'public'
      AND cls.relname = 'students'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel rel
    JOIN pg_class cls ON cls.oid = rel.prrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE rel.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
      AND ns.nspname = 'public'
      AND cls.relname = 'installments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.installments;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel rel
    JOIN pg_class cls ON cls.oid = rel.prrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE rel.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
      AND ns.nspname = 'public'
      AND cls.relname = 'receipts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.receipts;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel rel
    JOIN pg_class cls ON cls.oid = rel.prrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE rel.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
      AND ns.nspname = 'public'
      AND cls.relname = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel rel
    JOIN pg_class cls ON cls.oid = rel.prrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE rel.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
      AND ns.nspname = 'public'
      AND cls.relname = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END$$;
