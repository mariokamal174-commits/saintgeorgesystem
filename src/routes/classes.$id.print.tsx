import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, ArrowRight } from "lucide-react";
import { formatAge } from "@/lib/age";

export const Route = createFileRoute("/classes/$id/print")({
  head: () => ({ meta: [{ title: "طباعة بيانات الفصل" }] }),
  component: PrintClass,
});

const FIELDS: { key: string; label: string; format?: (value: unknown, student: Record<string, unknown>) => string }[] = [
  { key: "full_name", label: "اسم الطالب" },
  { key: "student_code", label: "كود الطالب" },
  { key: "national_id", label: "الرقم القومي" },
  { key: "birth_date", label: "تاريخ الميلاد" },
  { key: "_age", label: "السن (1/10)", format: (_value, student) => formatAge(student.birth_date as string | null) },
  { key: "phone", label: "الهاتف 1" },
  { key: "phone2", label: "الهاتف 2" },
  { key: "mother_name", label: "اسم الأم" },
  { key: "guardian_name", label: "ولي الأمر" },
  { key: "total_due", label: "إجمالي المستحق", format: (value) => formatAmount(value) },
  { key: "total_paid", label: "إجمالي المدفوع", format: (value) => formatAmount(value) },
  { key: "remaining_balance", label: "المتبقي", format: (value) => formatAmount(value) },
  { key: "payment_status", label: "حالة السداد", format: (value) => paymentStatusLabel(value) },
  { key: "is_transferred_in", label: "محول للمدرسة", format: (value) => (value ? "نعم" : "لا") },
];

function formatAmount(value: unknown) {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("ar-EG").format(num);
}

function paymentStatusLabel(value: unknown) {
  switch (String(value)) {
    case "paid":
      return "مسدد بالكامل";
    case "partial":
      return "مدفوع جزئيًا";
    case "unpaid":
      return "غير مسدد";
    default:
      return "—";
  }
}

function PrintClass() {
  const { id } = Route.useParams();
  const [klass, setKlass] = useState<Record<string, unknown> | null>(null);
  const [students, setStudents] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(FIELDS.map((f) => f.key)));

  useEffect(() => {
    const classQuery = supabase.from("classes").select("*, grades(name)").eq("id", id).maybeSingle();
    const studentsQuery = supabase.from("students").select("*, classes(name), grades(name)").eq("class_id", id).order("full_name");

    Promise.all([classQuery, studentsQuery]).then(([classRes, studentsRes]) => {
      setKlass(classRes.data as Record<string, unknown> | null);
      setStudents((studentsRes.data ?? []) as Record<string, unknown>[]);
    });
  }, [id]);

  const visibleFields = useMemo(() => FIELDS.filter((field) => selected.has(field.key)), [selected]);

  const totals = useMemo(() => {
    return students.reduce(
      (acc, student) => {
        acc.totalDue += Number(student.total_due ?? 0) || 0;
        acc.totalPaid += Number(student.total_paid ?? 0) || 0;
        acc.remaining += Number(student.remaining_balance ?? 0) || 0;
        return acc;
      },
      { totalDue: 0, totalPaid: 0, remaining: 0 },
    );
  }, [students]);

  const counts = useMemo(() => {
    const totals = { total: students.length, boys: 0, girls: 0, muslims: 0, christians: 0 };
    students.forEach((student) => {
      const gender = String(student.gender ?? "").trim();
      const religion = String(student.religion ?? "").trim();

      if (/^(?:ولد|boy|male)$/i.test(gender)) totals.boys++;
      if (/^(?:بنت|girl|female)$/i.test(gender)) totals.girls++;
      if (/^(?:مسلم|muslim)$/i.test(religion)) totals.muslims++;
      if (/^(?:مسيحي|christian)$/i.test(religion)) totals.christians++;
    });
    return totals;
  }, [students]);

  if (!klass) return <div className="text-center text-muted-foreground py-12">جاري التحميل...</div>;

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  const classTitle = String(klass.name ?? "الفصل");
  const gradeName = (klass.grades as { name?: string } | null | undefined)?.name;
  const academicYear = klass.academic_year ? String(klass.academic_year) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div className="flex items-center gap-3">
          <Link to="/students"><Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">طباعة بيانات الفصل</h1>
            <p className="text-sm text-muted-foreground">{gradeName ? `${gradeName} - ${classTitle}` : classTitle}{academicYear ? ` · السنة: ${academicYear}` : ""}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSelected(new Set(FIELDS.map((f) => f.key)))}>اختر الكل</Button>
          <Button variant="outline" onClick={() => setSelected(new Set())}>تفريغ</Button>
          <Button onClick={() => window.print()}><Printer className="ml-2 h-4 w-4" />طباعة / حفظ PDF</Button>
        </div>
      </div>

      <Card className="no-print">
        <CardHeader><CardTitle>اختر أعمدة الطلاب المراد طباعتها</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {FIELDS.map((field) => (
            <label key={field.key} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={selected.has(field.key)} onCheckedChange={() => toggle(field.key)} />
              <span className="text-sm">{field.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="print-area bg-white text-black p-8 rounded-lg border">
        <div className="mb-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="text-left space-y-1 text-sm">
              <div className="font-semibold">مديرية التربية و التعليم</div>
              <div className="font-semibold">ادارة بني سويف التعليمية</div>
              <div className="font-semibold">مدرسة سان جورج الدولية</div>
            </div>
            <div>
              <img src="/school-logo.png" alt="شعار المدرسة" className="h-20 w-auto object-contain" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold">{gradeName ? `${gradeName} - ${classTitle}` : classTitle}</h2>
            <p className="text-sm">طباعة بيانات الفصل</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-1 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">عدد الطلاب</div>
              <div className="font-semibold">{students.length}</div>
            </div>
          </div>
        </div>

        {students.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">لا يوجد طلاب مسجلين في هذا الفصل.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-right py-2 px-2 bg-gray-100 border border-gray-200 w-10">م</th>
                    {visibleFields.map((field) => (
                      <th key={field.key} className="text-right py-2 px-3 bg-gray-100 border border-gray-200">{field.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((student, index) => (
                    <tr key={String(student.id ?? Math.random())} className="border-b last:border-b-0">
                      <td className="py-2 px-2 border border-gray-200 align-top text-center w-10">{index + 1}</td>
                      {visibleFields.map((field) => {
                        const raw = field.key === "_age" ? undefined : student[field.key];
                        const value = field.key === "_age"
                          ? field.format?.(raw, student)
                          : field.format
                            ? field.format(raw, student)
                            : raw == null || raw === ""
                              ? "—"
                              : String(raw);
                        return (
                          <td key={field.key} className="py-2 px-3 border border-gray-200 align-top">{value}</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-8 space-y-6 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="text-right">
                  <div className="text-slate-600">الإجمالي</div>
                  <div className="mt-1 font-semibold">{counts.total}</div>
                </div>
                <div className="text-right">
                  <div className="text-slate-600">ولد</div>
                  <div className="mt-1 font-semibold">{counts.boys}</div>
                </div>
                <div className="text-right">
                  <div className="text-slate-600">بنت</div>
                  <div className="mt-1 font-semibold">{counts.girls}</div>
                </div>
                <div className="text-right">
                  <div className="text-slate-600">مسلم</div>
                  <div className="mt-1 font-semibold">{counts.muslims}</div>
                </div>
                <div className="text-right">
                  <div className="text-slate-600">مسيحي</div>
                  <div className="mt-1 font-semibold">{counts.christians}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-8 pt-8 text-sm px-4">
                <div className="text-right border-t border-slate-400 pt-2">شئون الطلبة</div>
                <div className="text-left border-t border-slate-400 pt-2">مديرة المدرسة</div>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area { border: none !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  );
}
